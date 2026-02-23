# @astroquery/astro-core

ホラリー占星術アプリ向けの天文計算コアです。  
現段階は同一リポジトリ内での切り出し運用（MVP）を目的としています。

## 現在のスコープ

- Swiss Ephemeris を使った天体位置・ハウス計算
- 月アスペクト計算（アプライ/セパレート）
- ボイドオブコース判定
- POF 計算
- エッセンシャルディグニティ判定

## 非スコープ

- Express ルーティング
- LLM プロンプト生成
- RAG 検索処理
- UI 表示ロジック

## 使い方（同一リポジトリ内）

```js
const {
  calculateHoroscope,
  calculateVoidStatus,
  getDignities,
} = require('../../packages/astro-core/src');
```

## 公開方針

- いまは `private: true`（非公開）
- API が安定し、テスト運用が固まった段階で npm 公開可否を再判断
