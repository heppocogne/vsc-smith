# 開発ロードマップ

雑多な機能を 1 つの拡張機能にまとめ、機能ごとに設定で on/off できるようにする。
このドキュメントは全体の方針と、各機能の実装方針・進捗をまとめる。

## 全体方針

### 機能モジュールの構成

- 1 機能 = `src/features/<feature>.ts` (大きくなったら `src/features/<feature>/` ディレクトリ)。
- エントリは `register<Feature>(context)` を export し、`src/extension.ts` の `activate` から呼ぶだけにする。
- 設定は `vsc-smith.<feature>.*` に置き、`vsc-smith.<feature>.enabled` で on/off する。
- on/off 対応は `ToggleableFeature` (`src/util/feature.ts`) に任せる。
  有効化時に機能のインスタンスを作り、無効化時や設定変更時に dispose → 再生成する。
  機能側は「コンストラクタで登録し、`dispose` で全部外す」だけを守ればよい。
- `ToggleableFeature` に乗らない機能 (markdown-it プラグインのように一度しか登録できないもの) は、その理由を機能のコメントに書く。

### 設定 (package.json)

- 機能が増えると設定画面が 1 つのリストに並んで探しにくくなる。
  `contributes.configuration` を配列にして機能ごとにセクションを分ける (Settings UI で見出しになる)。
- 各機能の `enabled` 以外の設定は、`enabled` が false のときに意味を持たないことを description に書く必要はない
  (セクション分けで十分伝わる)。

### テスト

- VS Code API に依存しないロジック (サイズ整形、パターン変換、リスト継続の計算など) は `src/util/` か
  機能ファイル内の純粋関数に切り出し、`src/test/` でユニットテストする。
- API に依存する部分は `vscode-test` の統合テストで最低限 (有効化・無効化で登録/解除されること) を確認する。
- 見た目に関わる部分 (ステータスバー、ツールチップ、Webview) は F5 の Extension Development Host で手動確認する。
  確認手順は各機能の節に書いておく。

### 進め方

1. 機能ごとに「調査 (スパイク) → 実装 → テスト → 手動確認 → コミット」の順で進める。
2. 1 機能 1 コミット (以上) にする。複数機能をまとめてコミットしない。
3. API の挙動が不確かなもの (下記「要検証」) は、本実装の前に小さく試してから設計を確定する。

## 機能一覧と進捗

| #   | 機能                                     | 設定セクション       | 状態                                            |
| --- | ---------------------------------------- | -------------------- | ----------------------------------------------- |
| 1   | ファイルサイズ表示                       | `vsc-smith.fileSize` | 実装・自動テスト済み                            |
| 2   | ~~バイナリファイルの読み込みスキップ~~   | —                    | 取り下げ (実機でピッカーが挟まり使い勝手が悪い) |
| 3   | ~~拡張子別のデフォルトエンコーディング~~ | —                    | 取り下げ (標準機能で代替)                       |
| 4   | Markdown 自動インデント                  | `vsc-smith.markdown` | 実装・自動テスト済み                            |
| 5   | GFM サポート (プレビュー・補完)          | `vsc-smith.gfm`      | プレビューを実装・自動テスト済み                |
| 6   | 区切り文字を指定したパスのコピー         | `vsc-smith.copyPath` | 実装                                            |
| 7   | Mermaid プレビュー                       | `vsc-smith.mermaid`  | 実装・自動テスト済み                            |
| 8   | 数式表示 (KaTeX)                         | `vsc-smith.math`     | 計画                                            |
| 9   | Markdown の表の整形                      | `vsc-smith.table`    | 計画                                            |
| 10  | Markdown の編集コマンド                  | `vsc-smith.mdEdit`   | 計画                                            |
| 11  | コピー系の追加                           | `vsc-smith.copyPath` | 計画 (6 の拡張)                                 |

---

## 1. ファイルサイズ表示 (`fileSize`)

### 実装

- ステータスバー: アクティブタブの URI を `fs.stat` してサイズを表示。保存時と、ファイルの外部変更
  (`FileSystemWatcher`) で更新する。左右は `statusBarAlignment` で切り替える。
  既定は左。右側だと、テキストファイルでは行/列・エンコーディングなどの組み込み項目と並び、
  サイズが見えないという報告があったため (原因は UI を確認できておらず未特定)。
- エクスプローラーのホバー: `FileDecorationProvider` の `tooltip` にサイズを入れる。
  デコレーションはタブなどにも出るが、バッジ・色は付けないので邪魔にならない。

### テスト

- 自動 (`src/test/fileSize.test.ts`): `statFile` (ファイル/ディレクトリ/存在しない/untitled)、
  デコレーションの tooltip、ステータスバーの表示・保存後の更新・外部変更の反映・タブ切り替えへの追従、
  `ToggleableFeature` の生成/破棄。

## 2. バイナリファイルの読み込みスキップ (取り下げ)

`workbench.editorAssociations` で拡張子をプレースホルダーのカスタムエディターに振り分け、
「Open Anyway」で開く方式を実装したが、実機確認で取り下げた。

- 中身が本当にバイナリのファイルは、拡張機能 API ではテキストとして強制的に開けない。
  プレースホルダーの Open Anyway の後に VS Code 標準の「バイナリなので表示しません」画面が出て、
  その Open Anyway でエディターの選択ピッカー (Text Editor / Binary Blocker) が出るため、3手順になる。
- 実装は削除した (コミット 3280013 に残っている)。

## 3. 拡張子別のデフォルトエンコーディング (取り下げ)

標準機能で代替できるため取り下げた。

- 言語ごとの指定: `"[bat]": { "files.encoding": "shiftjis" }`
- 拡張子が専用の言語 ID を持たない場合は、`files.associations` でその拡張子に言語を割り当ててから上記を使う。

---

## 4. Markdown 自動インデント (`markdown`)

記号のペア自動挿入 (`` ` ``, `*`, `**` など) は、箇条書きの `* ` で誤動作しやすいため対象外とする。
目標は自動インデント (リスト継続) のみ。構文強調・`[]`/`()` のペア・プレビューは組み込みに任せる。

### 機能

- Enter で箇条書き (`-`, `*`, `+`)・番号付きリスト (`1.`, `1)`)・タスクリスト・引用 (`>`) を継続する。
  - 番号は 1 つ増やす。タスクリストは `[ ] ` (未チェック) で継続する。後続項目の番号の振り直しはしない。
  - 本文の途中で Enter したら、カーソル以降を次の項目に移す。
  - 空の項目で Enter したら、ネストしていれば 1 段アウトデントし、トップレベルなら記号を消す。
    空の引用行 (`> `) では一番内側の `>` を消す。
- Tab / Shift+Tab で、カーソルが項目内 (記号より後ろ) のどこにあってもリスト項目の行全体をインデント/アウトデントする。
  - 幅は `editor.tabSize` / `insertSpaces` に従う。
  - Tab でネストした番号付き項目は `1.` に振り直す。Shift+Tab では番号を変えない。
- コードブロック (```` ``` ```` / `~~~`) の中と、区切り線 (`* * *` など) は対象外。フェンスは文書の先頭から数える。

### 方針

- `onEnterRules` は使わない。Enter / Tab / Shift+Tab は `when` 付きのキーバインドで独自コマンドに渡す。
  - `appendText` は固定文字列なので、番号のインクリメント (`1.` → `2.`) ができない。
  - `removeText` は新しい行のインデントを削るだけで、現在行は編集できない。空の項目で Enter したときに記号を消せない。
  - 箇条書き (`-`, `*`, `+`, `>`) だけなら記号ごとのルールで書けるが、リスト継続のロジックが JSON と TS の
    2 か所に分かれる。`setLanguageConfiguration` は他の拡張と後勝ちで競合するおそれもあるので、一部にも使わない。
- 「現在行とカーソル位置 → 編集内容 | `null`」を純粋関数にして、ユニットテストを厚くする。
  `null` は対象外を表し、コマンドはフォールバックする。
- フォールバックは `vscode.commands.executeCommand('type', { source: 'keyboard', text: '\n' })` とする。
  通常の Enter と同じ経路を通るので、インデント継承・括弧の間での改行・Vim 拡張などの `type` フックを壊さない。
  Tab / Shift+Tab は `tab` / `outdent` にフォールバックする。
- 選択範囲があるとき、カーソルがリスト記号より前にあるときは対象外とする。
- 編集は `editor.edit(..., { undoStopBefore: true, undoStopAfter: true })` で 1 回にまとめ、Ctrl+Z 1 回で戻せるようにする。
  `insertSnippet` はスニペットモードに入り Tab の挙動が変わるので使わない。
- キーバインドの `when` は次のとおり。
  `editorTextFocus && !editorReadonly && editorLangId == markdown && config.vsc-smith.markdown.enabled
  && !editorHasSelection && !suggestWidgetVisible && !inlineSuggestionVisible && !editorHasMultipleSelections && !inSnippetMode
  && !vsc-smith.markdown.yieldToMaio`
  - マルチカーソルは当面対象外とする。
  - Tab / Shift+Tab にはさらに `!editorTabMovesFocus` を、Tab には `!inlineEditIsVisible` を加える。
  - 「リスト行にいるときだけ Enter を奪う」コンテキストキーを `setContext` で更新する案は採らない。
    更新が非同期で古い値が残りうるため、フォールバック方式の方が単純で確実。

### 標準の Markdown との共存

組み込みの調査結果 (microsoft/vscode の `extensions/markdown-basics`, `extensions/markdown-language-features`)。

- 言語設定は `markdown-basics/language-configuration.json` にあり、`onEnterRules` と `indentationRules` は無い。
  組み込みの Enter はインデント継承と、`brackets` による括弧の間での改行だけ。
  - Enter を奪っても、フォールバックで `type` を呼べばどちらも保たれる。同等の挙動を自前で持つ必要は無い。
- `[`, `(`, `{`, `<` の自動閉じは `autoClosingPairs`、選択範囲の囲み (`` ` ``, `*`, `_`, `~`, `$` など) は
  `surroundingPairs` が担う。`` ` ``, `*`, `_` は自動閉じしない。この拡張では言語設定に触れず、組み込みに任せる。
  - `contributes.languages` で markdown の `configuration` を自前で宣言すると組み込み全体を置き換えてしまうので、宣言しない。
- `markdown-language-features` は言語設定を持たず、リンク先のパス補完・ペースト時のリンク更新・リンク挿入コマンドを
  Provider やコマンドで提供している。Enter / Tab のキーバインドとは衝突しない。
- IME 変換中の Enter はキーバインドに渡らないはず。Extension Development Host で確認する。

### Markdown All in One との共存

Markdown All in One (`yzhang.markdown-all-in-one`, 以下 MAIO) はリスト継続・Tab でのインデント・タスクリスト継続を
既に持ち、この機能より高機能。この機能は「MAIO を入れたくない人向けの軽量な代替」と位置づけ、MAIO があれば譲る。

- 同じキーに複数の拡張がバインドしたときの優先順位は保証されていないので、後勝ちには頼らない。
- `activate` で `vscode.extensions.getExtension('yzhang.markdown-all-in-one')` を調べ、
  コンテキストキー `vsc-smith.markdown.yieldToMaio` を `setContext` で立てる。キーバインドの `when` で除外する。
  - `vscode.extensions.onDidChange` を購読して、MAIO の有効化・無効化に追従する。
  - 設定 `vsc-smith.markdown.yieldToMarkdownAllInOne` (既定 `true`) を用意し、`false` なら譲らない。
    コンテキストキーは「MAIO が有効、かつこの設定が `true`」のときだけ立てる。
- MAIO 側の設定でリスト継続だけを切っている場合は検出しない。その場合は上の設定を `false` にしてもらう。
  README に書く。
- 確認すること:
  - 無効化された拡張を `getExtension` が返さないこと。
  - MAIO の Enter / Tab のコマンド名と `when` (`markdown.extension.onEnterKey` などのはず)。
    この方式は MAIO の `when` に依存しないが、README の説明のために確認する。

### 実装

- `src/features/markdown/listEdit.ts`: 行の分解と Enter / Tab / Shift+Tab の編集内容、フェンスの判定 (純粋関数)。
- `src/features/markdown/index.ts`: 3 つのコマンド (`vsc-smith.markdown.onEnter` / `onTab` / `onShiftTab`) と
  MAIO に譲るためのコンテキストキー。どちらも `ToggleableFeature` で生成/破棄する。
- 設定は `vsc-smith.markdown.enabled` と `vsc-smith.markdown.yieldToMarkdownAllInOne`。

### テスト

- 自動 (`src/test/markdown.test.ts`): 行の分解、Enter / Tab / Shift+Tab の編集内容、フェンスの判定、
  コマンドの編集・フォールバック・CRLF の文書・1 回の undo で戻ること、無効化でコマンドが外れること。

## 5. GFM サポート (`gfm`)

### プレビュー

組み込みのプレビュー (markdown-it) は表・取り消し線に対応済み。タスクリストのチェックボックスとアラートを足す。
脚注・絵文字ショートコードは対象外 (必要になったら検討)。

- タスクリスト: リスト項目の先頭の `[ ]` / `[x]` / `[X]` を無効化したチェックボックスに置き換える。
  記号の後ろに空白と本文が必要。`li` に `task-list-item`、親リストに `contains-task-list` を付ける。
- アラート: `[!NOTE]` / `[!TIP]` / `[!IMPORTANT]` / `[!WARNING]` / `[!CAUTION]` (大文字小文字は区別しない) が
  引用の 1 行目に単独であるとき、引用に `markdown-alert markdown-alert-<種類>` を付け、タイトル行を足す。
  リスト項目の中の引用は対象にする (Markdown All in One と同じ。GitHub は対象外)。
  別の引用の中にネストしたもの、本文が無いものは対象外。アイコンは付けない。

### 方針

- `contributes."markdown.markdownItPlugins": true` を宣言し、`activate` から `{ extendMarkdownIt(md) }` を返す。
- `extendMarkdownIt` は一度しか呼ばれず、足したルールは外せないので `ToggleableFeature` には乗らない。
  ルールが実行のたびに `vsc-smith.gfm.enabled` を読み、無効なら何もしない。
  設定が変わったら `markdown.preview.refresh` を呼んで、開いているプレビューに反映する。
- プラグインは既存の npm パッケージを使わず自前で書き、ランタイム依存を持たない。
  どちらも markdown-it のコアルールで、末尾 (`text_join` の後) に足す。渡された `md` と `state.Token` だけを使う。
  - `markdown-it` と `@types/markdown-it` は devDependencies (型とテスト用)。バンドルには入らない。
  - markdown-it 15 は同梱の型定義がこの tsconfig (CommonJS + Node16) でエラーになるため、14 を使う。
- エスケープした `\[ ]` や `\[!NOTE]` を拾わないよう、トークンだけでなく元のソース (`inline.content`) も照合する。
- スタイルは `media/gfm.css` を `markdown.previewStyles` で足す。追加した要素だけを対象にし、
  色は `--vscode-charts-*` (無ければ GitHub の色) を使う。無効時もクラスが付かないので影響しない。

### 実装

- `src/features/gfm/taskList.ts` / `alert.ts`: markdown-it プラグイン (`vscode` に依存しない。有効判定は関数で受け取る)。
- `src/features/gfm/index.ts`: `registerGfm(context)` が `{ extendMarkdownIt }` を返す。設定変更でプレビューを更新する。

### テスト

- 自動 (`src/test/gfm.test.ts`): 実物の markdown-it に通した HTML (タスクリスト・アラートの対象/対象外、無効時)、
  `activate` の戻り値が設定に追従すること。


### 補完

- タスクリスト `- [ ] ` の継続は 4 で実装済み。
- 表の整形は 9 で扱う。

## 6. 区切り文字を指定したパスのコピー (`copyPath`)

### 実装

- 組み込みの「Copy Relative Path」はそのまま残し、その下に、組み込みが今使っていない区切り文字でコピーするコマンドを足す。
  `explorer.copyRelativePathSeparator` が `/` なら `Copy Relative Path (\)`、`\` なら `Copy Relative Path (/)` を出す。
  `auto` は OS に従う (Windows は `\`、それ以外は `/`)。出し分けは `when` 句だけで行い、設定の変更にも追従する。
- 絶対パスのコピーは対象外 (相対パスだけ)。`/` 以外・`\` 以外の区切り文字も今は扱わない。
- メニュー: エクスプローラー (`6_copypath`)、エディタータブ (`1_cutcopypaste`)、コマンドパレット。
  `when` に `config.vsc-smith.copyPath.enabled` を入れ、無効時は項目ごと隠す。
- 対象の決め方は組み込みに合わせる。エクスプローラーの複数選択は改行 (`os.EOL`) で連結し、引数なしならアクティブタブ。
  相対パスは `workspace.asRelativePath` を使い、マルチルートではフォルダー名を付け、ワークスペース外ならフルパスになる。
- `/` への変換は Windows のときだけ行う。Linux/macOS では `\` がファイル名に使えるため。

### テスト

- 自動 (`src/test/copyPath.test.ts`): 区切り文字の変換、複数選択の扱い、2 コマンドのクリップボード出力、引数なし実行。


## 7. Mermaid プレビュー (`mermaid`)

Markdown プレビューで `mermaid` のコードブロック (``` / ~~~) を図として表示する。GFM とは別の機能として扱う。
ノートブック、エディター内の表示、画像への書き出し、拡大・縮小は対象外。

### 他の Mermaid 表示との共存

VS Code 1.121 で Markdown Preview Mermaid Support (`bierner.markdown-mermaid`) が組み込みの拡張
Mermaid Markdown Features (`vscode.mermaid-markdown-features`) として取り込まれた。
この機能は「1.120 以前」か「組み込みを無効にしている」場合の代替と位置づけ、どちらかが有効なら譲る。

- 設定 `vsc-smith.mermaid.yieldToOtherExtensions` (既定 `true`)。`false` なら譲らない。
- 判定は `vscode.extensions.getExtension` で行い、markdown-it のルールが実行のたびに確かめる。
  譲るときはフェンスに手を付けないので、相手の拡張がそのまま描画する。
- 出力する要素のクラスは `vsc-smith-mermaid` とする。`mermaid` にすると他の拡張のスクリプトが拾い、二重に描画される。

### 方針

- 拡張ホスト側 (markdown-it): `fence` のレンダールールを包み、言語が `mermaid` のフェンスを
  `<pre class="vsc-smith-mermaid">ソース</pre>` にする。ソースは HTML エスケープする。
  - プレビューがトークンに付けた `data-line` と `code-line` (スクロール同期用) は引き継ぐ。
  - プレビューは同じトークンを複数回レンダーするので、トークンは書き換えない。
  - GFM と同じ理由で `ToggleableFeature` には乗らない。設定と拡張の増減でプレビューを更新する。
- プレビュー側 (`contributes."markdown.previewScripts"` の `media/mermaid.js`、素の JS):
  - 対象の要素が無ければ何もしない。mermaid 本体 (約 5MB) は図が初めて出たときに一度だけ読み込む。
    譲っているときや無効時に本体を読み込まないため。
  - 本体は `node_modules/mermaid/dist/mermaid.min.js` をそのまま読む。プレビューは拡張のフォルダー全体を
    リソースルートにするので、コピーは要らない。`<script>` を足すときは、プレビューの CSP を通すために
    自分の nonce を引き継ぐ。
  - `securityLevel: "strict"`。テーマは `body` のクラスから決める (ライトは `default`、ダーク/ハイコントラストは `dark`)。
  - プレビューの更新 (`vscode.markdown.updateContent`) とテーマの切り替え (`body` のクラスの変化) で描き直す。
    結果をソースごとに覚えておき、変わっていない図は待たずに差し替える (更新のたびにちらつかないように)。
  - 構文エラーはエラーメッセージの下に元のソースを出す。`render` はエラー時に図の残骸を文書に残すので、先に `parse` する。
- `mermaid` は `dependencies` に入れる。バンドルはせず、`.vscodeignore` の
  `!node_modules/mermaid/dist/mermaid.min.js` で vsix にはこの 1 ファイルだけ入れる。

### 実装

- `src/features/mermaid/plugin.ts`: markdown-it プラグイン (`vscode` に依存しない)。
- `src/features/mermaid/index.ts`: `registerMermaid(context)` が `{ extendMarkdownIt }` を返す。譲るかどうかの判定。
- `src/util/markdownPreview.ts`: GFM と共有する型とプレビューの更新。`activate` が両方のプラグインをまとめて返す。
- `media/mermaid.js` / `media/mermaid.css`: プレビュー側のスクリプトとスタイル。

### テスト

- 自動 (`src/test/mermaid.test.ts`): 実物の markdown-it に通した HTML (対象/対象外、エスケープ、属性の引き継ぎ、無効時)、
  `activate` の戻り値が設定に追従すること、スクリプトと本体のファイルがあること。
- `media/mermaid.js` は自動テストに乗っていない。

## 8. 数式表示 (`math`) — 計画

VS Code 標準の数式表示 (`markdown.math.enabled`) は 1.72 には無いので、プレビューに KaTeX で `$...$` / `$$...$$` を表示する。
標準の数式表示がある新しい VS Code では、それに譲る (7 の Mermaid と同じ考え方)。

### 方針

- 既存の GFM・Mermaid と同じく、markdown-it プラグイン (拡張ホスト側) + プレビュー側スクリプトの構成にする。
  `ToggleableFeature` には乗らず、設定を実行のたびに読む。
- 区切りの判定 (インライン `$...$`、ブロック `$$...$$`) はプラグインで行い、数式のソースを HTML エスケープして
  専用クラス (`vsc-smith-math`) の要素に出す。他の拡張のクラスは使わず、二重描画を避ける。
- 描画は `katex` を `dependencies` に入れ、プレビュー側で `katex.render` を呼ぶ (サーバー側で HTML 化する案は要検証)。
  - 本体と CSS・フォントは `.vscodeignore` で必要なファイルだけ vsix に入れる。
  - 数式が無いときは本体を読み込まない (Mermaid と同様)。
- 通貨の `$5 and $10` を数式と誤認しないよう、開き `$` の直後・閉じ `$` の直前が空白でないこと、
  閉じ `$` の直後が数字でないことを条件にする。コードスパン・コードブロック内は対象外。
- 要検証: 1.72 のプレビューの CSP で KaTeX のフォント・スタイルを読めるか。

### テスト

- 自動: 実物の markdown-it に通した HTML (インライン・ブロック、通貨との区別、エスケープ、コード内、無効時)。
- 手動: 数式、ダークテーマ、プレビューの更新、数式エラー時の表示。

## 9. Markdown の表の整形 (`table`) — 計画

- コマンド `vsc-smith.table.format`: カーソルのある GFM の表の列幅を揃える (Markdown 以外・表の外では何もしない)。
  - 列幅は表示幅で計算する。全角 (CJK) は幅 2、半角は 1。
  - 配置指定 (`:---`, `:---:`, `---:`) は保持し、区切り行の長さだけ揃える。
  - 行頭のインデント・引用 (`>`) の中の表・セル内の `\|` を扱う。コードスパン内の `|` は区切りとして扱わない。
- Tab / Shift+Tab: 表の中では次/前のセルへ移動し、最後のセルの Tab で行を追加する。
  整形してから移動する。表の外では何もせず、4 のリスト操作とフォールバックを共有する (リスト項目内の表は表を優先)。
- 保存時の自動整形は設定 `vsc-smith.table.formatOnSave` (既定 false)。
- 「行・カーソル位置 → 編集内容 | `null`」の純粋関数に切り出し、ユニットテストを厚くする。
  表の範囲は `|` を含む連続行と区切り行の存在で判定し、フェンスの中は対象外 (4 のフェンス判定を共用)。
- 編集は 1 回の undo で戻せるようにする。

## 10. Markdown の編集コマンド (`mdEdit`) — 計画

Markdown All in One があるときは、同等のコマンドを持つのでキーバインドを譲る (4 と同じ仕組み)。コマンドは残す。

- タスクのトグル: 現在行 (複数行の選択も) の `- [ ]` と `- [x]` を切り替える。
  タスクでないリスト項目はタスク化し、タスクの記号の無い行は何もしない。
- URL の貼り付け: 選択範囲がある状態で、クリップボードが URL (`http(s)://`) だけなら `[選択文字](URL)` にする。
  それ以外は通常の貼り付けにフォールバックする (`editor.action.clipboardPasteAction`)。Ctrl+V にキーバインドを置き、
  `when` は Markdown・選択あり・書き込み可。
- 日時の挿入: 書式は設定 `vsc-smith.mdEdit.dateTimeFormat` (既定 `YYYY-MM-DD HH:mm`)。
- 太字・斜体のトグル: 選択範囲を `**` / `*` で囲む。すでに囲まれていれば外す。ペアの自動挿入ではなく、コマンド実行時だけ働く。
- キーバインドは既定で付けすぎない。付けるのはタスクのトグルと URL の貼り付けだけにし、残りはコマンドパレットから使う。
- 純粋関数 (トグル後のテキスト、URL 判定、囲み/解除) をユニットテストし、コマンドは統合テストで確認する。

## 11. コピー系の追加 (`copyPath` の拡張) — 計画

6 の設定 `vsc-smith.copyPath.enabled` の下に、コマンドを足す。いずれもエクスプローラー・エディタータブ・コマンドパレットに出す。

- 選択行つきのパス: `相対パス:12-20` (1 行だけなら `:12`)。エディターのコンテキストメニューとコマンドパレット。
- Markdown リンクとしてコピー: `[ファイル名](相対パス)`。相対パスの区切りは `/` にし、空白などは `%20` にエンコードする。
- Python のモジュールパス: `.py` ファイルのワークスペースからの相対パスを `.` 区切りにする (`pkg/mod.py` → `pkg.mod`)。
  `__init__.py` はパッケージ名にする。`.py` 以外では出さない (`when` で `resourceExtname == .py`)。
- 相対パスの求め方は 6 と共通化する。変換は純粋関数に切り出してユニットテストする。
