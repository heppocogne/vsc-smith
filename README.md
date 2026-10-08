# VSCodeSmith
![](https://github.com/heppocogne/vsc-smith/actions/workflows/ci_ts.yaml/badge.svg)

![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white)
![Claude](https://img.shields.io/badge/claude-%23D97757.svg?style=for-the-badge&logo=claude&logoColor=white)
![GitHub Actions](https://img.shields.io/badge/github%20actions-%232671E5.svg?style=for-the-badge&logo=githubactions&logoColor=white)

---

雑多な拡張機能集です。
VSCode 1.70以降を想定しています。

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

スプレッドシートからコピーしたセル範囲 (タブ区切り) は、既定ではそのまま (タブ区切りで) 貼り付けます。貼り付け直後に表示される選択肢 (Ctrl+. で開く) から、Markdown のテーブルに切り替えられます。`vsc-smith.markdown.pasteTable.default` を `table` にすると、最初からテーブルとして貼り付けます。
貼り付け後の選択肢は VS Code 1.87 以降の機能です。それ以前のバージョンでは、コマンド `VSCodeSmith: Paste as Markdown Table` (コマンドパレット) でクリップボードをテーブルとして貼り付けられます。通常の貼り付け (Ctrl+V) はそのままです。

既存の分割プレビューとは別に、コマンド `VSCodeSmith: Open Full Preview` (エディタータイトルのボタン、またはコマンドパレット) で、プレビューを現在のエディターグループのタブとして開きます。

#### GFM

標準の Markdown プレビューに、GitHub Flavored Markdown の表示を足します(一部)。

- タスクリスト (`- [ ]` / `- [x]`) をチェックボックスで表示します。プレビュー上では操作できません。
- アラート (`> [!NOTE]`, `> [!TIP]`, `> [!IMPORTANT]`, `> [!WARNING]`, `> [!CAUTION]`) を色付きのブロックで表示します。  
アイコンは[Material Icons](https://fonts.google.com/icons)からお借りしました。
アイコンのライセンスは[Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0)です。
- 脚注 (`[^1]` と `[^1]: 本文`) を、文書末尾の脚注一覧と戻りリンク付きで表示します。

#### Mermaid

標準の Markdown プレビューで、`mermaid` のコードブロックを図として表示します。配色は VS Code のテーマ (ライト/ダーク) に合わせます。構文エラーのときは、エラーメッセージと元のソースを表示します。

VS Code 1.121 以降は標準で Mermaid を表示できるので、既定ではそちら (または Markdown Preview Mermaid Support) に譲ります。

#### Copy Button

標準の Markdown プレビューのコードブロックに、コードをクリップボードへコピーするボタンを表示します。ボタンはコードブロックにマウスを重ねると現れ、位置は左上・右上 (既定)・左下・右下から選べます。

## 設定

| 設定                                         | 既定値 | 説明                                              |
| -------------------------------------------- | :----: | ------------------------------------------------- |
| `vsc-smith.fileSize.enabled`                 | `true` | ファイルサイズ表示機能を有効にする                |
| `vsc-smith.fileSize.statusBar`               | `true` | ステータスバーにサイズを表示する                  |
| `vsc-smith.fileSize.statusBarAlignment`      | `left` | ステータスバー上の表示位置                        |
| `vsc-smith.fileSize.explorerTooltip`         | `true` | エクスプローラーのツールチップにサイズを表示する  |
| `vsc-smith.copyPath.enabled`                 | `true` | 逆区切り文字の相対パスコピーを有効にする          |
| `vsc-smith.markdown.enabled`                 | `true` | Markdown のリスト継続・インデントを有効にする     |
| `vsc-smith.markdown.pasteTable.enabled`      | `true` | タブ区切りテキストをテーブルとして貼り付けられるようにする |
| `vsc-smith.markdown.pasteTable.default`      | `text` | タブ区切りテキストを最初に貼り付ける形式 (`text` / `table`) |
| `vsc-smith.markdown.yieldToMarkdownAllInOne` | `true` | Markdown All in One が有効なときはそちらに譲る    |
| `vsc-smith.gfm.enabled`                      | `true` | プレビューでタスクリスト・アラート・脚注を表示する      |
| `vsc-smith.mermaid.enabled`                  | `true` | プレビューで mermaid のコードブロックを図にする   |
| `vsc-smith.mermaid.yieldToOtherExtensions`   | `true` | 標準や他の拡張の Mermaid 表示があればそちらに譲る |
| `vsc-smith.copyButton.enabled`               | `true` | プレビューのコードブロックにコピーボタンを表示する |
| `vsc-smith.copyButton.position`              | `top-right` | コピーボタンの位置 (`top-right` / `bottom-right`) |
