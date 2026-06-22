# TCG-LAN-Battle

**Pocket TCG // PEGASUS MQTT**

GitHub Pages 上で動作する、静的 HTML / CSS / JavaScript 製のカードゲーム実験プロジェクトです。
ローカルアカウント、ルーム対戦、MQTT over WebSocket、カードゲーム用ルールエンジンを組み合わせた、学習・プロトタイプ向けの構成です。

---

## 概要

このプロジェクトは、ブラウザだけで動作するカードゲームのプロトタイプです。

GitHub Pages 上で Node.js サーバーを実行するのではなく、クライアント側 JavaScript から MQTT over WebSocket に接続し、ルームコードを使って2人対戦を行います。

---

## 主な機能

* `localStorage` によるローカルアカウント保存
* GitHub Pages 対応
* MQTT over WebSocket によるリアルタイム通信
* 2人対戦
* ルームコードによる入室
* ホスト権威型の状態管理
* 公開状態と個人状態の分離
* 手札、デッキ、賞品カードの個人管理
* カードゲーム用ルールエンジン
* CSS による簡易ホログラム / グレア / チルト表現

---

## 重要な注意

このプロジェクトには、公式カード画像、公式ロゴ、公式スキャン画像、公式カードデータの完全複製は含まれていません。

同梱されているカードは、動作確認用の架空カードです。
このプロジェクトは、公式 Pokémon TCG の完全再現ではありません。

公式カード、公式画像、商標、ロゴ、スキャン画像、または第三者の素材を使用する場合は、著作権、商標権、各データソースの利用条件を必ず確認してください。

クレジット表記だけでは、利用許諾の代わりにはなりません。

---

## クレジット

カードのホログラム表現、チルト表現、カード UI の研究・着想について、以下のプロジェクトに敬意を表します。

* Simon Goellner / @simeydotme
* `pokemon-cards-css`
* `pokemon-cards-151`
* `hover-tilt`

このテンプレートでは、上記プロジェクトの CSS をそのままコピーせず、独自に簡略化したホログラム / グレア表現を実装しています。

元コードを直接取り込む場合は、元プロジェクトのライセンス条件を必ず確認してください。

---

## GitHub Pages で公開する方法

1. このプロジェクトを GitHub リポジトリにアップロードします。
2. GitHub の `Settings` を開きます。
3. `Pages` を開きます。
4. `Deploy from a branch` を選択します。
5. ブランチを `main` に設定します。
6. 公開フォルダを `/docs` に設定します。
7. 保存します。

公開後、次のような URL でアクセスできます。

```txt
https://ユーザー名.github.io/リポジトリ名/
```

---

## ローカルでテストする方法

`file://` で `index.html` を直接開くと、ブラウザの制限により `fetch()` が正常に動作しない場合があります。
ローカルテストでは、簡易 HTTP サーバーを使用してください。

```bash
cd docs
python -m http.server 8080
```

ブラウザで次の URL を開きます。

```txt
http://localhost:8080
```

---

## ファイル構成

```txt
pokemon-pages-mqtt-tcg/
├── README.md
└── docs/
    ├── index.html
    ├── style.css
    ├── data/
    │   ├── cards-lite.json
    │   └── starter-decks.json
    └── js/
        ├── account.js
        ├── app.js
        ├── cards.js
        ├── mqtt-game.js
        └── rules-engine.js
```

---

## カードを増やす場所

カード定義は次のファイルにあります。

```txt
docs/data/cards-lite.json
```

デッキ定義は次のファイルにあります。

```txt
docs/data/starter-decks.json
```

カードを追加する場合は、カード ID とデッキ内のカード ID を一致させてください。

---

## 効果を増やす場所

ルール処理は次のファイルにあります。

```txt
docs/js/rules-engine.js
```

ここに次のような処理を追加できます。

* 継続効果
* 特殊状態
* スタジアム
* ポケモンのどうぐ
* デッキ検索
* コイン判定
* 相手に選択を要求する効果
* ダメージ補正
* きぜつ時の処理

---

## 免責事項

このプロジェクトは、非公式の学習用・実験用プロジェクトです。

Nintendo、Creatures、GAME FREAK、The Pokémon Company、またはその他の権利者とは関係ありません。
また、これらの企業によって承認、後援、提携されたものではありません。
::: 
