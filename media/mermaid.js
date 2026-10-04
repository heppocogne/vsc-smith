// @ts-check
// Preview script (contributes."markdown.previewScripts"): draws the elements that the markdown-it rule in
// src/features/mermaid/plugin.ts has left in the Markdown preview. Runs in the preview webview, not in the extension.
(function () {
	const SELECTOR = 'pre.vsc-smith-mermaid';
	const DIAGRAM_CLASS = 'vsc-smith-mermaid-diagram';
	const ERROR_CLASS = 'vsc-smith-mermaid-error';
	const MESSAGE_CLASS = 'vsc-smith-mermaid-message';

	const script = /** @type {HTMLScriptElement} */ (document.currentScript);
	// The preview allows the whole extension folder as a resource root, so the library is read where npm put it.
	const libraryUrl = new URL('../node_modules/mermaid/dist/mermaid.min.js', script.src).href;
	const nonce = script.nonce;

	/** @typedef {{ svg: string } | { error: string }} Result */

	/** @type {Promise<any> | undefined} */
	let library;
	/** Results by diagram source, so that an update of the preview shows unchanged diagrams without a flicker. @type {Map<string, Result>} */
	let results = new Map();
	/** The source of the elements already drawn, to draw them again when the theme changes. @type {WeakMap<Element, string>} */
	const sources = new WeakMap();
	let theme = currentTheme();
	let nextId = 0;

	function currentTheme() {
		const classes = document.body.classList;
		const dark = classes.contains('vscode-dark')
			|| (classes.contains('vscode-high-contrast') && !classes.contains('vscode-high-contrast-light'));
		return dark ? 'dark' : 'default';
	}

	/** The library is several megabytes, so it is only loaded once a document has a diagram. */
	function loadLibrary() {
		library ??= new Promise((resolve, reject) => {
			const element = document.createElement('script');
			element.src = libraryUrl;
			// The content security policy of the preview only runs scripts carrying its nonce.
			element.nonce = nonce;
			element.onload = () => resolve(/** @type {any} */(window).mermaid);
			element.onerror = () => reject(new Error(`Failed to load ${libraryUrl}`));
			document.head.appendChild(element);
		});
		return library;
	}

	/**
	 * @param {string} source
	 * @returns {Promise<Result>}
	 */
	async function draw(source) {
		const id = `vsc-smith-mermaid-${nextId++}`;
		try {
			const mermaid = await loadLibrary();
			mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme });
			// `render` leaves an error diagram in the document for a syntax error; `parse` only throws.
			await mermaid.parse(source);
			return { svg: (await mermaid.render(id, source)).svg };
		} catch (e) {
			return { error: e instanceof Error ? e.message : String(e) };
		} finally {
			document.getElementById(id)?.remove();
			document.getElementById(`d${id}`)?.remove();
		}
	}

	/**
	 * @param {Element} element
	 * @param {string} source
	 * @param {Result} result
	 */
	function show(element, source, result) {
		sources.set(element, source);
		element.classList.remove(DIAGRAM_CLASS, ERROR_CLASS);
		if ('svg' in result) {
			element.classList.add(DIAGRAM_CLASS);
			// Sanitized by the library (`securityLevel: 'strict'`).
			element.innerHTML = result.svg;
			return;
		}
		element.classList.add(ERROR_CLASS);
		const message = document.createElement('div');
		message.className = MESSAGE_CLASS;
		message.textContent = result.error;
		const code = document.createElement('code');
		code.textContent = source;
		element.replaceChildren(message, code);
	}

	/** @param {Element} element */
	function isDrawn(element) {
		return element.classList.contains(DIAGRAM_CLASS) || element.classList.contains(ERROR_CLASS);
	}

	async function update() {
		if (theme !== currentTheme()) {
			theme = currentTheme();
			results = new Map();
			for (const element of document.querySelectorAll(SELECTOR)) {
				const source = sources.get(element);
				if (isDrawn(element) && source !== undefined) {
					element.classList.remove(DIAGRAM_CLASS, ERROR_CLASS);
					element.textContent = source;
				}
			}
		}
		const drawnFor = theme;
		// An update of the preview replaces the drawn elements with fresh ones holding the source again.
		const pending = [...document.querySelectorAll(SELECTOR)].filter(element => !isDrawn(element));
		for (const element of pending) {
			const source = element.textContent ?? '';
			let result = results.get(source);
			if (!result) {
				result = await draw(source);
				if (drawnFor !== theme) {
					// The theme changed meanwhile; the `update` it triggered draws everything again.
					return;
				}
				results.set(source, result);
			}
			// The preview may have been updated while drawing; that `update` takes care of the new content.
			if (element.isConnected && !isDrawn(element) && element.textContent === source) {
				show(element, source, result);
			}
		}
	}

	window.addEventListener('vscode.markdown.updateContent', update);
	new MutationObserver(update).observe(document.body, { attributes: true, attributeFilter: ['class'] });
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', update);
	} else {
		update();
	}
})();
