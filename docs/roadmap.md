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

| # | 機能 | 設定セクション | 状態 |
|---|------|----------------|------|
| 1 | ファイルサイズ表示 | `vsc-smith.fileSize` | 実装・自動テスト済み・未コミット |
| 2 | ~~バイナリファイルの読み込みスキップ~~ | — | 取り下げ (実機でピッカーが挟まり使い勝手が悪い) |
| 3 | ~~拡張子別のデフォルトエンコーディング~~ | — | 取り下げ (標準機能で代替) |
| 4 | Markdown 自動インデント | `vsc-smith.markdown` | 実装・自動テスト済み・未コミット |
| 5 | GFM サポート (プレビュー・補完) | `vsc-smith.gfm` | プレビューを実装・自動テスト済み・未コミット |
| 6 | 区切り文字を指定したパスのコピー | `vsc-smith.copyPath` | 実装・自動テスト済み・未コミット |

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

### 残作業

- [ ] 手動確認: エクスプローラーのホバーで実際にサイズが出ること、ステータスバーの左右切り替え、
      ファイルでないタブ (設定画面など) で非表示になること、diff エディタ、リモート (WSL/SSH) のファイル。
- [ ] 大規模ワークスペースでの負荷確認。`**/*` の watcher とエクスプローラー表示ごとの `stat` が重くないか。
      問題があれば watcher をやめ、エクスプローラーの再描画任せにする。
- [ ] 未保存の変更があるときに「保存済みのサイズ」を出していることを明示するか検討 (tooltip に一言など)。

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

### 残作業

- [ ] 手動確認: 実際のキー入力で Enter / Tab / Shift+Tab が効くこと、IME 変換中の Enter、補完候補表示中の Enter/Tab、
      MAIO を入れたときに譲ること (`yieldToMarkdownAllInOne` の切り替えも)、Vim 拡張との共存。
- [ ] README に MAIO との関係を書く。

## 5. GFM サポート (`gfm`)

### プレビュー

組み込みのプレビュー (markdown-it) は表・取り消し線に対応済み。タスクリストのチェックボックスとアラートを足す。
脚注・絵文字ショートコードは対象外 (必要になったら検討)。

- タスクリスト: リスト項目の先頭の `[ ]` / `[x]` / `[X]` を無効化したチェックボックスに置き換える。
  記号の後ろに空白と本文が必要。`li` に `task-list-item`、親リストに `contains-task-list` を付ける。
- アラート: `[!NOTE]` / `[!TIP]` / `[!IMPORTANT]` / `[!WARNING]` / `[!CAUTION]` (大文字小文字は区別しない) が
  引用の 1 行目に単独であるとき、引用に `markdown-alert markdown-alert-<種類>` を付け、タイトル行を足す。
  GitHub に合わせ、リストや引用の中にネストしたもの、本文が無いものは対象外。アイコンは付けない。

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

### 残作業

- [ ] 手動確認: 実際のプレビューでチェックボックスとアラートが出ること、ライト/ダーク/ハイコントラストでの色、
      設定の切り替えが開いているプレビューに反映されること、プレビューのスクロール同期が崩れないこと。
- [ ] 組み込みのプレビューが将来アラートなどに対応したら、重複しないか確認する。

### 補完

- タスクリスト `- [ ] ` の継続は 4 で実装済み。
- 表の整形はスコープ外 (必要になったら検討)。

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

### 残作業

- [ ] 手動確認: ワークスペース内での相対パス、マルチルート、メニューの位置、Linux/macOS での表示。

---

## 次のステップ

1. 1・2 の手動確認と、Open Anyway の制約・アンインストール時の残留エントリへの対処方針を決める。
2. 1・2 を機能ごとにコミットする。
3. 4 の手動確認 (Extension Development Host) とコミット。
