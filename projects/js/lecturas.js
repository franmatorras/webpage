// Lecturas Page - Interactive functionality
let booksData = [];
let loadError = null;

// Localization for months
const monthNames = {
    1: 'Enero',
    2: 'Febrero',
    3: 'Marzo',
    4: 'Abril',
    5: 'Mayo',
    6: 'Junio',
    7: 'Julio',
    8: 'Agosto',
    9: 'Septiembre',
    10: 'Octubre',
    11: 'Noviembre',
    12: 'Diciembre'
};

// Columns pulled from Supabase, including the embedded book/author/reading log rows
const LECTURAS_SELECT = [
    'id',
    'status',
    'state',
    'language',
    'date_added',
    'acquisition_source',
    'books(title,publication_year,original_language,series_name,series_number,book_authors(authors(name)))',
    'reading_logs(notes,start_date,end_date)'
].join(',');

// Database values that differ from the labels shown on the page.
// Anything not listed here is rendered as it comes from the database.
const STATUS_MAP = {
    finished: 'terminadas'
};
const LANGUAGE_MAP = {
    Spanish: 'Español',
    spa: 'Español',
    English: 'Inglés',
    eng: 'Inglés'
};

// "active" is the default state in the database and means "nothing to report",
// so it is not shown as an "Estado" section
const NEUTRAL_STATE = 'active';

// How "Cómo lo descubrí" and the opinion are packed into reading_logs.notes
const SOURCE_PREFIX = 'Cómo lo descubrí:';
const NOTES_SEPARATOR = 'Notes:';

// Some rows were written as UTF-8 bytes read back as Latin-1, so accented text
// arrives double-encoded ("Ana Iris SimÃ³n"). Text that is already correct
// makes decodeURIComponent throw, and is returned untouched — which also makes
// this a no-op once the rows are repaired in the database.
function fixEncoding(value) {
    if (!value) {
        return '';
    }
    try {
        return decodeURIComponent(escape(value));
    } catch (error) {
        return value;
    }
}

function applyMap(value, map) {
    if (!value) {
        return '';
    }
    return map[value] || value;
}

// Most recent reading log for a book
function getLatestLog(logs) {
    const withNotes = (logs || []).filter(log => log.notes);
    if (withNotes.length === 0) {
        return null;
    }
    const logDate = log => log.end_date || log.start_date || '';
    withNotes.sort((a, b) => logDate(b).localeCompare(logDate(a)));
    return withNotes[0];
}

// Split "Cómo lo descubrí: X. Notes: Y" into the two sections the page shows.
// Notes without those markers are treated as an opinion.
function parseNotes(rawNotes) {
    const notes = fixEncoding(rawNotes).trim();
    if (!notes.startsWith(SOURCE_PREFIX)) {
        return { source: '', opinion: notes };
    }

    const rest = notes.slice(SOURCE_PREFIX.length);
    const separatorIndex = rest.indexOf(NOTES_SEPARATOR);
    if (separatorIndex === -1) {
        return { source: rest.trim().replace(/\.$/, ''), opinion: '' };
    }

    return {
        source: rest.slice(0, separatorIndex).trim().replace(/\.$/, ''),
        opinion: rest.slice(separatorIndex + NOTES_SEPARATOR.length).trim()
    };
}

// Turn one personal_library row into the flat book object the table renders
function mapLibraryRow(row) {
    const book = row.books;
    if (!book) {
        return null;
    }

    const author = (book.book_authors || [])
        .map(link => link.authors && fixEncoding(link.authors.name))
        .filter(Boolean)
        .join(', ');

    // date_added is a DATE ("YYYY-MM-DD"); split it instead of using Date()
    // so the month never shifts with the browser's timezone
    const [yearAdded, monthAdded] = row.date_added ? row.date_added.split('-') : ['', ''];

    const latestLog = getLatestLog(row.reading_logs);
    const notes = latestLog ? parseNotes(latestLog.notes) : { source: '', opinion: '' };
    const state = row.state && row.state !== NEUTRAL_STATE ? row.state : '';

    return {
        id: row.id,
        title: fixEncoding(book.title),
        author: author,
        year: book.publication_year || '',
        status: applyMap(row.status, STATUS_MAP),
        monthAdded: monthAdded ? Number(monthAdded) : '',
        yearAdded: yearAdded ? Number(yearAdded) : '',
        originalLanguage: applyMap(fixEncoding(book.original_language), LANGUAGE_MAP),
        readLanguage: applyMap(fixEncoding(row.language), LANGUAGE_MAP),
        source: notes.source || fixEncoding(row.acquisition_source),
        series: fixEncoding(book.series_name),
        seriesNumber: book.series_number === null || book.series_number === undefined ? '' : book.series_number,
        opinion: notes.opinion,
        state: state
    };
}

// Load books data from Supabase
async function loadBooks() {
    if (typeof SUPABASE_URL === 'undefined' || typeof SUPABASE_ANON_KEY === 'undefined') {
        throw new Error('Falta js/supabase-config.js con SUPABASE_URL y SUPABASE_ANON_KEY');
    }

    const url = `${SUPABASE_URL}/rest/v1/personal_library`
        + `?select=${encodeURIComponent(LECTURAS_SELECT)}`
        + `&order=date_added.desc`;

    const response = await fetch(url, {
        headers: { apikey: SUPABASE_ANON_KEY }
    });

    if (!response.ok) {
        throw new Error(`Supabase respondió ${response.status}: ${await response.text()}`);
    }

    const rows = await response.json();
    booksData = rows.map(mapLibraryRow).filter(Boolean);
}

// Message shown when the data could not be fetched
function renderLoadError() {
    document.getElementById('tab-content').innerHTML = `
        <div style="text-align: center; padding: 2rem; color: #999;">
            <p>No se han podido cargar las lecturas.</p>
        </div>
    `;
}

// Get month and year string for grouping
function getMonthYearString(month, year) {
    return `${monthNames[month]} ${year}`;
}

// Sort books by month and year (newest first)
function sortBooksByDate(books) {
    return books.sort((a, b) => {
        if (a.yearAdded !== b.yearAdded) {
            return b.yearAdded - a.yearAdded; // Newer years first
        }
        return b.monthAdded - a.monthAdded; // Newer months first
    });
}

// Group books by month and year
function groupBooksByMonthYear(books) {
    const grouped = {};
    
    books.forEach(book => {
        const key = getMonthYearString(book.monthAdded, book.yearAdded);
        if (!grouped[key]) {
            grouped[key] = [];
        }
        grouped[key].push(book);
    });
    
    return grouped;
}

// Format book details for expandable section
function formatBookDetails(book) {
    const sections = [];
    
    if (book.originalLanguage) {
        sections.push({
            title: 'Idioma Original',
            content: book.originalLanguage
        });
    }
    
    if (book.readLanguage && book.readLanguage !== book.originalLanguage) {
        sections.push({
            title: 'Idioma Leído',
            content: book.readLanguage
        });
    }
    
    if (book.source) {
        sections.push({
            title: 'Cómo lo descubrí',
            content: book.source
        });
    }
    
    if (book.series) {
        const seriesInfo = book.seriesNumber ? `${book.series} - Libro ${book.seriesNumber}` : book.series;
        sections.push({
            title: 'Series',
            content: seriesInfo
        });
    }
    
    if (book.opinion) {
        sections.push({
            title: 'Opinión',
            content: book.opinion
        });
    }
    
    if (book.state) {
        const stateLabel = book.state === 'cancelado' ? 'Abandonada' : book.state === 'pausado' ? 'En pausa' : book.state;
        sections.push({
            title: 'Estado',
            content: stateLabel
        });
    }
    
    return sections;
}

// Render books table for a given status
function renderBooks(status) {
    const tabContent = document.getElementById('tab-content');

    if (loadError) {
        renderLoadError();
        return;
    }

    // Filter books by status
    const filteredBooks = booksData.filter(book => book.status === status);
    
    if (filteredBooks.length === 0) {
        tabContent.innerHTML = `
            <div style="text-align: center; padding: 2rem; color: #999;">
                <p>No hay libros en esta categoría.</p>
            </div>
        `;
        return;
    }
    
    // Sort books
    const sortedBooks = sortBooksByDate(filteredBooks);
    const groupByMonth = status === 'terminadas' || status === 'canceladas_pausadas';
    const groupedBooks = groupByMonth ? groupBooksByMonthYear(sortedBooks) : null;
    
    const showStatusColumn = status === 'canceladas_pausadas';
    // Build table HTML
    let tableHTML = `
        <div class="table-wrapper">
            <table>
                <thead>
                    <tr>
                        <th>Título</th>
                        <th>Autor</th>
                        <th>Año publicación</th>
                        ${showStatusColumn ? `<th class="status-header"><span class="table-help" title="En pausa: ⏳ | Abandonada: ✗">?</span></th>` : ''}
                    </tr>
                </thead>
                <tbody>
    `;
    
    const renderBookRow = book => {
        const details = formatBookDetails(book);
        const bookRowClasses = ['book-row'];
        const hasDetails = details.length > 0;
        
        if (hasDetails) {
            bookRowClasses.push('has-details');
        }
        
        const rowClassString = bookRowClasses.join(' ');
        const expandableRowId = `expandable-${book.id}`;
        const clickAttribute = hasDetails ? `onclick="toggleRow('${book.id}')" role="button" aria-expanded="false"` : '';
        const statusIcon = showStatusColumn && book.state ? (book.state === 'cancelado' ? '✗' : book.state === 'pausado' ? '⏳' : '') : '';
        const statusTitle = showStatusColumn && book.state ? (book.state === 'cancelado' ? 'Abandonada' : book.state === 'pausado' ? 'En pausa' : '') : '';
        const statusCell = showStatusColumn ? `<td class="status-cell"><span class="status-icon" title="${statusTitle}">${statusIcon}</span></td>` : '';
        
        let rowHTML = `
            <tr class="${rowClassString}" data-book-id="${book.id}" ${clickAttribute}>
                <td>
                    <div class="book-title">${book.title}</div>
                </td>
                <td>
                    <div class="book-author">${book.author}</div>
                </td>
                <td>
                    <div class="book-year">${book.year}</div>
                </td>
                ${statusCell}
            </tr>
        `;
        
        if (hasDetails) {
            rowHTML += `
                <tr class="expandable-row" id="${expandableRowId}">
                    <td colspan="${showStatusColumn ? 4 : 3}">
                        <div class="expandable-content">
            `;
            
            details.forEach(detail => {
                rowHTML += `
                    <div class="expandable-section">
                        <div class="expandable-section-title">${detail.title}</div>
                        <div class="expandable-section-content">${detail.content}</div>
                    </div>
                `;
            });
            
            rowHTML += `
                        </div>
                    </td>
                </tr>
            `;
        }
        
        return rowHTML;
    };
    
    if (groupByMonth) {
        const monthYearKeys = Object.keys(groupedBooks).sort((a, b) => {
            const [aMonthName, aYear] = a.split(' ');
            const [bMonthName, bYear] = b.split(' ');
            const aMonth = Number(Object.keys(monthNames).find(k => monthNames[k] === aMonthName));
            const bMonth = Number(Object.keys(monthNames).find(k => monthNames[k] === bMonthName));
            if (aYear !== bYear) {
                return Number(bYear) - Number(aYear);
            }
            return bMonth - aMonth;
        });

        monthYearKeys.forEach(monthYearKey => {
            tableHTML += `
                <tr class="month-year-row">
                    <td colspan="4">${monthYearKey}</td>
                </tr>
            `;

            groupedBooks[monthYearKey].forEach(book => {
                tableHTML += renderBookRow(book);
            });
        });
    } else {
        sortedBooks.forEach(book => {
            tableHTML += renderBookRow(book);
        });
    }
    
    tableHTML += `
                </tbody>
            </table>
        </div>
    `;
    
    tabContent.innerHTML = tableHTML;
}

// Toggle expandable row
function toggleRow(bookId) {
    const expandableRow = document.getElementById(`expandable-${bookId}`);
    if (expandableRow) {
        expandableRow.classList.toggle('expanded');
        const bookRow = document.querySelector(`tr[data-book-id="${bookId}"]`);
        if (bookRow) {
            const expanded = expandableRow.classList.contains('expanded');
            bookRow.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        }
    }
}

// Collapse all expandable rows
function collapseAll() {
    const expandableRows = document.querySelectorAll('.expandable-row.expanded');
    expandableRows.forEach(row => {
        row.classList.remove('expanded');
        
        // Get the corresponding toggle icon and reset it
        const bookId = row.previousElementSibling.dataset.bookId;
        const toggleIcon = document.querySelector(`tr[data-book-id="${bookId}"] .expand-toggle`);
        if (toggleIcon) {
            toggleIcon.textContent = '▶';
        }
    });
}

// Switch to a different tab
function switchTab(status) {
    // Update active tab button
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-status="${status}"]`).classList.add('active');
    
    // Collapse all rows before switching tab
    collapseAll();
    
    // Render books for this status
    renderBooks(status);
}

// Initialize event listeners
function initializeEventListeners() {
    // Tab buttons
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.addEventListener('click', function() {
            const status = this.getAttribute('data-status');
            switchTab(status);
        });
    });
    
    // Collapse all button
    document.getElementById('collapse-all-btn').addEventListener('click', collapseAll);
}

// Initialize the page
document.addEventListener('DOMContentLoaded', async function() {
    try {
        await loadBooks();
    } catch (error) {
        loadError = error;
        console.error('Error loading books data:', error);
    }
    initializeEventListeners();

    // Render default tab (en_marcha)
    switchTab('en_marcha');
});
