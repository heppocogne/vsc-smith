// @ts-check
// Preview script (contributes."markdown.previewScripts"): adds a copy button to the code blocks that the markdown-it
// rule in src/features/copyButton/plugin.ts has marked. Runs in the preview webview, not in the extension.
(function () {
	const SELECTOR = 'pre[data-vsc-smith-copy]';
	const BUTTON_CLASS = 'vsc-smith-copy-button';
	const COPIED_CLASS = 'vsc-smith-copy-copied';

	/** @param {string} text */
	async function writeClipboard(text) {
		try {
			await navigator.clipboard.writeText(text);
			return;
		} catch {
			// The webview may not be allowed to use the clipboard API; fall back to the old way.
		}
		const area = document.createElement('textarea');
		area.value = text;
		area.style.position = 'fixed';
		area.style.opacity = '0';
		document.body.appendChild(area);
		area.select();
		try {
			document.execCommand('copy');
		} finally {
			area.remove();
		}
	}

	/** The code of the block, without the button. @param {Element} pre */
	function codeOf(pre) {
		return (pre.querySelector('code') ?? pre).textContent ?? '';
	}

	/** @param {HTMLElement} pre */
	function addButton(pre) {
		if (pre.querySelector(`:scope > .${BUTTON_CLASS}`) || pre.classList.contains('vsc-smith-mermaid')) {
			return;
		}
		const button = document.createElement('button');
		button.type = 'button';
		button.className = BUTTON_CLASS;
		button.textContent = 'Copy';
		button.title = 'Copy code';
		button.addEventListener('click', async () => {
			await writeClipboard(codeOf(pre));
			button.textContent = 'Copied';
			button.classList.add(COPIED_CLASS);
			setTimeout(() => {
				button.textContent = 'Copy';
				button.classList.remove(COPIED_CLASS);
			}, 1500);
		});
		pre.appendChild(button);
	}

	function update() {
		for (const pre of /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll(SELECTOR))) {
			addButton(pre);
		}
	}

	window.addEventListener('vscode.markdown.updateContent', update);
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', update);
	} else {
		update();
	}
})();
