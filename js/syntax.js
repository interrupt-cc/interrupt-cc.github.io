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

        // Apply rules in order
        SYNTAC_DICT.forEach(rule => {
            code = code.replace(rule.regex, (match, p1) => {
                // Determine what to wrap based on capturing groups vs whole match
                const target = p1 !== undefined ? p1 : match;
                // Avoid replacing inside existing span tags
                if (match.includes('<span')) return match;
                return match.replace(target, `<span class="syn-${rule.type}">${target}</span>`);
            });
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
