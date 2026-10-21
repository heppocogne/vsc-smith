# Change Log

All notable changes to the "VSCodeSmith" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

- Initial release
- Terminal Restore: ワークスペースを開き直したときに、ターミナルの名前・作業ディレクトリ・環境変数を復元する
- Python Format: ast / tokenize だけで実装した Black 風の Python フォーマッターを追加 (既定は無効)
- Python Format: 範囲指定のフォーマット (文単位) に対応し、`editor.formatOnSaveMode: modifications` で使えるようにした
- Git Graph: コミットグラフの表示、コミットの右クリックで差分表示・ブランチ作成、ブランチの右クリックで名前変更・削除・マージ・リベースを追加 (Git Graph / GitLens が有効なときは譲る)
