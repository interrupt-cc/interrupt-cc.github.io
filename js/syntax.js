/**
 * syntax.js - STOCHASTIC_HIGHLIGHT
 * Zero-dependency, isomorphic-ready Regex syntax highlighter.
 */

const SYNTAC_DICT = [
    { regex: /(\/\/.*)/g, type: 'comment' }, // Single-line comments
    { regex: /(\/\*[\s\S]*?\*\/)/g, type: 'comment' }, // Multi-line comments
    { regex: /"(.*?)"/g, type: 'string' }, // Double-quote strings
    { regex: /'(.*?)'/g, type: 'string' }, // Single-quote strings
    { regex: /\b(fn|pub|let|mut|const|return|if|else|while|for|loop|struct|enum|match|use|mod|impl|trait)\b/g, type: 'keyword' }, // Core Rust/JS Keywords
    { regex: /\b(true|false|null|None|Some|Ok|Err)\b/g, type: 'literal' }, // Literals
    { regex: /\b([a-zA-Z_]\w*)(?=\s*\()/g, type: 'function' }, // Function calls
    { regex: /\b([A-Z][a-zA-Z0-9_]*)\b/g, type: 'type' }, // Types / Structs
    { regex: /\b(\d[\d_]*(\.[\d_]+)?)\b/g, type: 'number' } // Numbers
];

function highlightSyntax() {
    document.querySelectorAll('pre code').forEach(block => {
        let code = block.innerHTML;

        // Prevent double highlight
        if (code.includes('<span class="syn-')) return;

        let tokens = [];
        let tokenIndex = 0;

        // Apply rules in order, extracting matched chunks to prevent HTML corruption
        SYNTAC_DICT.forEach(rule => {
            code = code.replace(rule.regex, (match, p1) => {
                const target = p1 !== undefined ? p1 : match;
                const id = `__SYN_TOKEN_${tokenIndex++}__`;
                const wrapped = match.replace(target, `<span class="syn-${rule.type}">${target}</span>`);
                tokens.push({ id, text: wrapped });
                return id;
            });
        });

        // Rehydrate the tokens
        tokens.forEach(token => {
            code = code.replace(token.id, token.text);
        });

        block.innerHTML = code;
    });
}

// Auto-run if loaded in a browser environment
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', highlightSyntax);
}

// Export for potential isomorphic rendering during the batch process
if (typeof module !== 'undefined') {
    module.exports = { highlightSyntax };
}
