// Lecturas Page - Interactive functionality
let booksData = [];

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

// Load books data from JSON
async function loadBooks() {
    try {
        const response = await fetch('/projects/data/lecturas.json');
        const data = await response.json();
        booksData = data.books;
    } catch (error) {
        console.error('Error loading books data:', error);
    }
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
    await loadBooks();
    initializeEventListeners();
    
    // Render default tab (en_marcha)
    switchTab('en_marcha');
});
