# VSCodeSmith
![](https://github.com/heppocogne/vsc-smith/actions/workflows/ci.yaml/badge.svg)

雑多な拡張機能集です。

## 機能

### File Size

アクティブなファイルのサイズをステータスバーに表示し、エクスプローラーのツールチップにもサイズを表示します。

### Copy Path

標準の "Copy Relative Path" (`explorer.copyRelativePathSeparator`) とは逆の区切り文字で相対パスをコピーするコマンドを追加します。

- `VSCodeSmith: Copy Relative Path (/)`
- `VSCodeSmith: Copy Relative Path (\)`

### Markdown

VSCode標準のMarkdownサポート+多少の構文補完です。
Enter で箇条書き・番号付きリスト・タスクリスト・引用を継続し、Tab / Shift+Tab でリスト項目をインデント/アウトデントします。Markdown All in One が有効なときは、既定でそちらに譲ります。

## 設定

| 設定 | 既定値 | 説明 |
| --- | --- | --- |
| `vsc-smith.fileSize.enabled` | `true` | ファイルサイズ表示機能を有効にする |
| `vsc-smith.fileSize.statusBar` | `true` | ステータスバーにサイズを表示する |
| `vsc-smith.fileSize.statusBarAlignment` | `left` | ステータスバー上の表示位置 |
| `vsc-smith.fileSize.explorerTooltip` | `true` | エクスプローラーのツールチップにサイズを表示する |
| `vsc-smith.copyPath.enabled` | `true` | 逆区切り文字の相対パスコピーを有効にする |
| `vsc-smith.markdown.enabled` | `true` | Markdown のリスト継続・インデントを有効にする |
| `vsc-smith.markdown.yieldToMarkdownAllInOne` | `true` | Markdown All in One が有効なときはそちらに譲る |
