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

### Terminal Restore

ワークスペースを開き直したときに、前回開いていたターミナルを作り直します。復元するのは次の項目だけで、プロセスや履歴は復元しません。

- 名前: ターミナルを作成したときに指定された名前か、後から変更された名前 (右クリックの「名前の変更」など)。変更されていない既定の名前は保存せず、シェルの標準のタイトルに任せます。
- 作業ディレクトリ: VS Code 1.93 以降でシェル統合が有効なら、`cd` した後の現在のディレクトリ。それ以外は作成時のディレクトリ。
- 環境変数: ターミナル作成時に指定されたもの (`terminal.integrated.env.*` や拡張機能が指定したもの)。シェルの中で `export` した変数は取得できないので復元できません。ワークスペースの保存領域に平文で保存されるので、秘密の値を含めたくないときは `vsc-smith.terminalRestore.restoreEnv` を `false` にしてください。

変更は 1 秒ほど遅れて保存します。ウィンドウを閉じる直前の変更は反映されないことがあります。VS Code 標準のターミナル復元 (`terminal.integrated.enablePersistentSessions`) でターミナルが戻っているときは、重複を避けるため何もしません (`vsc-smith.terminalRestore.skipIfRestoredByVSCode`)。

### Copy Path

標準の "Copy Relative Path" (`explorer.copyRelativePathSeparator`) とは逆の区切り文字で相対パスをコピーするコマンドを追加します。

- `VSCodeSmith: Copy Relative Path (/)`
- `VSCodeSmith: Copy Relative Path (\)`

### Markdown

VSCode標準のMarkdownサポート+多少の構文補完です。
Enter で箇条書き・番号付きリスト・タスクリスト・引用を継続し、Tab / Shift+Tab でリスト項目をインデント/アウトデントします。Markdown All in One が有効なときは、既定でそちらに譲ります。

スプレッドシートからコピーしたセル範囲 (タブ区切り) は、既定ではそのまま (タブ区切りで) 貼り付けます。貼り付け直後に表示される選択肢 (Ctrl+. で開く) から、Markdown のテーブルに切り替えられます。`vsc-smith.markdown.pasteTable.default` を `table` にすると、最初からテーブルとして貼り付けます。
貼り付け後の選択肢は VS Code 1.87 以降の機能です。それ以前のバージョンでは、コマンド `VSCodeSmith: Paste as Markdown Table` (コマンドパレット) でクリップボードをテーブルとして貼り付けられます。通常の貼り付け (Ctrl+V) はそのままです。

既存の分割プレビューとは別に、コマンド `VSCodeSmith: Open Preview` (エディタータイトルのボタン、またはコマンドパレット) で、プレビューを現在のエディターグループのタブとして開きます。

#### 編集コマンド (mdEdit)

コマンドパレットの `VSCodeSmith:` から使えます。

| コマンド | 内容 | 既定のキー |
| --- | --- | --- |
| Toggle Task | 選択行の `- [ ]` / `- [x]` を切り替える。チェックボックスの無いリスト項目はタスクにする | `Alt+C` |
| Paste URL as Link | 文字列を選択して URL を貼り付けると `[選択文字](URL)` にする。URL 以外は通常の貼り付け | `Ctrl+V` (選択あり) |
| Insert Date and Time | 日時を挿入する。書式は `vsc-smith.mdEdit.dateTimeFormat` | — |
| Toggle Bold / Italic / Strikethrough / Inline Code | 選択範囲 (無ければカーソルの単語) を `**` / `*` / `~~` / `` ` `` で囲む。囲まれていれば外す | — |
| Insert Footnote | カーソル位置に `[^n]` を入れ、文書末尾に定義 `[^n]: ` を足してカーソルを移す (n は既存の数字ラベルの最大値 + 1) | — |
| Move List Item Up / Down | リスト項目を子項目ごと、同じ階層の上下の項目と入れ替える。番号付きリストは番号を保つ。動かせないときは標準の行移動 | `Alt+↑` / `Alt+↓` |
| Duplicate List Item | リスト項目を子項目ごと直下に複製する。番号付きリストは番号を振り直す | — |
| Renumber Ordered List | カーソルのあるリスト (複数行選択ならその範囲) の番号を、階層ごとに最初の番号から振り直す | — |

Markdown All in One が有効なときは、キーバインドをそちらに譲ります (コマンドは残ります)。

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

### Git Graph

コミットグラフを、パネルの「Git Graph (Smith)」ビューに表示します (`git log --branches --remotes --tags HEAD --date-order` 相当。jj の `refs/jj/*` や stash は含めません、300 件ずつ「Load more」で追加)。ワークスペースの最初の git リポジトリを対象にし、ブランチの作成・削除・コミットなどでグラフが更新されます。

- 複数行のコミットメッセージは、行には 1 行目だけを表示し、末尾の `▸` が付いたコミットをクリックすると残りの行を展開します (もう一度クリックで折りたたみ)。
- コミットを右クリック: `Show Diff` (変更ファイルを選んで親コミットとの差分を開く。ダブルクリックでも可)、`Create Branch Here`
- ブランチ (ラベル) を右クリック: `Rename Branch`、`Delete Branch` (ローカルのみ)、`Merge into Current Branch`、`Rebase Current Branch onto This`

git は VS Code の Git 拡張が使うもの (`git.path` 設定、または自動検出されたもの) を使います。

Git Graph (`mhutchie.git-graph`) か GitLens (`eamodio.gitlens`) が有効なときは、既定でそちらに譲ってビューを表示しません (`vsc-smith.gitGraph.yieldToOtherExtensions`)。

### Python Format

Python のフォーマッター (Black 風の簡易版) を追加します。標準ライブラリの `ast` と `tokenize` だけで実装しており、フォーマッターのためにパッケージを追加する必要はありません (Python 3.9 以降が必要です)。既定では無効です。

`vsc-smith.pythonFormat.enabled` を `true` にし、`editor.defaultFormatter` に `heppocogne.vsc-smith` を指定すると、`Format Document` (保存時のフォーマットを含む) で使えます。

- 文字列は二重引用符にそろえ、演算子・カンマの前後の空白、括弧、空行 (トップレベルの定義の前後は 2 行、入れ子では 1 行) を整えます。
- 1 行が 88 桁 (全角文字は 2 桁) を超えるときは、Black と同様に括弧や `and` / `+` などの位置で折り返し、複数行のコレクションには末尾にカンマを付けます。
- コメントは保持します。ステートメントの途中にコメントがあるときは、そのステートメントを元の書式のままにします。
- 整形の前後で AST が一致しない場合は、何も変更せずにエラーを返します。構文エラーのファイルも変更しません。

範囲指定のフォーマット (`Format Selection`、`editor.formatOnSaveMode` を `modifications` にした保存時のフォーマット) は、文単位で行います。範囲に触れた文 (複数行にまたがる文は全体) と、`if x:` や `def f(...):` のようなブロックの見出し行だけを整形し、それ以外の行 (空行、単独行のコメント、デコレーター、docstring、同じ行に複数の文があるもの) は変更しません。空行の数は整えません。

Black との違い: マジックトレーリングカンマ (末尾のカンマで複数行を維持する)、`# fmt: off` / `# fmt: on` には対応していません。

Python をコマンドラインから使うこともできます。

```sh
cd python
python -m vsc_smith_pyfmt path/to/file.py        # 整形結果を標準出力へ (標準入力も可)
python -m vsc_smith_pyfmt --check path/to/file.py # 変更が必要なら終了コード 1
python -m vsc_smith_pyfmt --lines 10-20 --lines 40 path/to/file.py # 触れた文だけを整形
```

## 設定

| 設定                                         | 既定値 | 説明                                              |
| -------------------------------------------- | :----: | ------------------------------------------------- |
| `vsc-smith.fileSize.enabled`                 | `true` | ファイルサイズ表示機能を有効にする                |
| `vsc-smith.fileSize.statusBar`               | `true` | ステータスバーにサイズを表示する                  |
| `vsc-smith.fileSize.statusBarAlignment`      | `left` | ステータスバー上の表示位置                        |
| `vsc-smith.fileSize.explorerTooltip`         | `true` | エクスプローラーのツールチップにサイズを表示する  |
| `vsc-smith.terminalRestore.enabled`          | `true` | ターミナルの名前・cwd・環境変数を復元する         |
| `vsc-smith.terminalRestore.restoreEnv`       | `true` | 環境変数も保存・復元する                          |
| `vsc-smith.terminalRestore.skipIfRestoredByVSCode` | `true` | VS Code 標準の復元でターミナルがあれば復元しない |
| `vsc-smith.copyPath.enabled`                 | `true` | 逆区切り文字の相対パスコピーを有効にする          |
| `vsc-smith.markdown.enabled`                 | `true` | Markdown のリスト継続・インデントを有効にする     |
| `vsc-smith.markdown.pasteTable.enabled`      | `true` | タブ区切りテキストをテーブルとして貼り付けられるようにする |
| `vsc-smith.markdown.pasteTable.default`      | `text` | タブ区切りテキストを最初に貼り付ける形式 (`text` / `table`) |
| `vsc-smith.markdown.yieldToMarkdownAllInOne` | `true` | Markdown All in One が有効なときはそちらに譲る    |
| `vsc-smith.mdEdit.enabled`                   | `true` | Markdown の編集コマンドを有効にする               |
| `vsc-smith.mdEdit.dateTimeFormat`            | `YYYY-MM-DD HH:mm` | 日時の挿入の書式                      |
| `vsc-smith.mdEdit.yieldToMarkdownAllInOne`   | `true` | Markdown All in One が有効なときはキーを譲る      |
| `vsc-smith.gitGraph.enabled`                 | `true` | コミットグラフを有効にする                        |
| `vsc-smith.gitGraph.yieldToOtherExtensions`  | `true` | Git Graph / GitLens が有効なときはそちらに譲る    |
| `vsc-smith.pythonFormat.enabled`             | `false` | Python のフォーマッターを有効にする               |
| `vsc-smith.pythonFormat.pythonPath`          | `""`   | フォーマッターの実行に使う Python (空なら `python3` / Windows は `python`)。ユーザー設定のみ有効で、ワークスペース設定は無視される |
| `vsc-smith.gfm.enabled`                      | `true` | プレビューでタスクリスト・アラート・脚注を表示する      |
| `vsc-smith.mermaid.enabled`                  | `true` | プレビューで mermaid のコードブロックを図にする   |
| `vsc-smith.mermaid.yieldToOtherExtensions`   | `true` | 標準や他の拡張の Mermaid 表示があればそちらに譲る |
| `vsc-smith.copyButton.enabled`               | `true` | プレビューのコードブロックにコピーボタンを表示する |
| `vsc-smith.copyButton.position`              | `top-right` | コピーボタンの位置 (`top-right` / `bottom-right`) |
