// src/services/rendererService.js

/**
 * A comprehensive renderer that takes raw text and applies the appropriate rendering.
 * It converts Markdown to HTML, then finds and renders math blocks and code blocks.
 * @param {string} rawContent The raw text content from a message.
 * @returns {HTMLElement} A div element containing the fully rendered HTML.
 */
function renderContent(rawContent) {
    const container = document.createElement('div');

    // 1. Render Markdown to HTML
    if (window.marked) {
        container.innerHTML = window.marked.parse(rawContent);
    } else {
        console.warn('Marked.js not loaded. Displaying raw text.');
        container.innerText = rawContent;
        return container;
    }

    // 2. Render Math expressions in the generated HTML
    if (window.renderMathInElement) {
        window.renderMathInElement(container, {
            delimiters: [
                {left: '$$', right: '$$', display: true},
                {left: '$', right: '$', display: false},
                {left: '\\(', right: '\\)', display: false},
                {left: '\\[', right: '\\]', display: true}
            ],
            throwOnError: false
        });
    } else {
        console.warn('KaTeX auto-render not loaded.');
    }

    // 3. Highlight code blocks in the generated HTML
    if (window.hljs) {
        container.querySelectorAll('pre code').forEach((block) => {
            window.hljs.highlightElement(block);
        });
    } else {
        console.warn('highlight.js not loaded.');
    }

    return container;
}

module.exports = {
    renderContent,
};
