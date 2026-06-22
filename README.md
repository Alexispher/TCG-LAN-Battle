# Pocket TCG // PEGASUS MQTT

> GitHub Pages で動作する、静的 HTML/CSS/JavaScript 製のローカルアカウント型カードゲーム実験プロジェクトです。

## 概要

このプロジェクトは、ブラウザだけで動作するカードゲームのプロトタイプです。Node.js サーバーを GitHub Pages 上で動かすのではなく、クライアント側 JavaScript から MQTT over WebSocket に接続して、ルーム制の対戦を行います。

主な機能:

- ローカルアカウント保存: `localStorage`
- GitHub Pages 対応: `docs/` フォルダを公開
- MQTT over WebSocket によるルーム通信
- 2人対戦
- ホスト権威型のゲーム進行
- 公開状態と個人状態の分離
- 手札、デッキ、賞品カードの個人状態
- ポケモン風のカードゲームルールエンジン
- 基本ポケモン、進化、エネルギー、アイテム、サポーター、スタジアム、どうぐ
- 継続効果、特殊状態、コイン判定、デッキ検索のサンプル実装
- CSS によるホログラム/チルト表現

## 重要な注意

このプロジェクトには、公式カード画像、公式ロゴ、公式スキャン画像は含まれていません。

同梱されているカードはテスト用の架空カードです。公式 Pokémon TCG の完全再現ではありません。

公式カードを使用する場合は、著作権、商標、各データソースの利用条件を必ず確認してください。クレジット表記だけでは利用許諾の代わりにはなりません。

## クレジット

カードのホログラム表現、チルト表現、カード UI の研究・着想について、以下のプロジェクトに敬意を表します。

- Simon Goellner / @simeydotme
- `pokemon-cards-css`
- `pokemon-cards-151`
- `hover-tilt`

このテンプレートでは、上記プロジェクトの CSS をそのままコピーせず、独自に簡略化したホログラム/グレア表現を実装しています。元コードを直接取り込む場合は、元プロジェクトのライセンス条件を確認してください。

## GitHub Pages で公開する方法

1. このリポジトリを GitHub にアップロードします。
2. `Settings` を開きます。
3. `Pages` を開きます。
4. `Deploy from a branch` を選択します。
5. ブランチを `main` にします。
6. フォルダを `/docs` にします。
7. 保存します。

公開後、次のような URL で開けます。

```txt
https://ユーザー名.github.io/リポジトリ名/
```

## ローカルでテストする方法

`file://` で直接開くと `fetch()` が正常に動かない場合があります。簡易サーバーを使ってください。

Python がある場合:

```bash
cd docs
python -m http.server 8080
```

ブラウザで開きます。

```txt
http://localhost:8080
```

## 遊び方

1. 最初にローカルアカウントを作ります。
2. 1人目が「Criar sala」を押します。
3. 表示されたルームコードを2人目に渡します。
4. 2人目はコードを入力して入室します。
5. ホストが「Iniciar partida」を押します。
6. 手札のボタンから、カードを出す、エネルギーを付ける、攻撃する、逃げる、ターン終了を行います。

## 通信方式

通信トピックは概ね次の構造です。

```txt
pegasus/pockettcg/v1/<ROOM>/lobby
pegasus/pockettcg/v1/<ROOM>/actions
pegasus/pockettcg/v1/<ROOM>/state
pegasus/pockettcg/v1/<ROOM>/private/<PLAYER_ID>
```

- `state`: 公開状態
- `private/<PLAYER_ID>`: そのプレイヤーだけが UI 上で使う個人状態
- `actions`: プレイヤーが送信する行動
- `lobby`: 入室・参加者同期

注意: 公開 MQTT ブローカーを利用する場合、これは暗号化されたアプリ内認証ではありません。カジュアル用途・学習用途向けです。本格的な対戦ゲームにする場合は、専用ブローカー、認証、署名、再接続制御、不正対策が必要です。

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

## カードを増やす場所

カード定義はここです。

```txt
docs/data/cards-lite.json
```

デッキ定義はここです。

```txt
docs/data/starter-decks.json
```

## 効果を増やす場所

ルール処理はここです。

```txt
docs/js/rules-engine.js
```

以下のような処理を追加できます。

- 継続効果
- 特殊状態
- スタジアム
- ポケモンのどうぐ
- デッキ検索
- コイン判定
- 相手の選択を要求する効果
- ダメージ補正
- ノックアウト時の処理

## 実装済みのサンプル効果

- `heat-aura`: 攻撃ダメージ +10
- `thick-hide`: 受けるダメージ -10
- `tool-damage-plus-10`: どうぐによる攻撃ダメージ +10
- `stadium-retreat-minus-1`: スタジアムによる逃げるコスト -1
- `search-basic-pokemon`: デッキから基本ポケモンを検索
- `coin-burn`: コインでやけど
- `coin-paralyze`: コインでマヒ
- `poison-opponent-active`: 相手のバトルポケモンをどく

## まだ完全ではない部分

このプロジェクトは、完全な公式ルール再現ではなく、拡張可能なプロトタイプです。

今後追加すべきもの:

- 全カードの個別効果
- 複数選択を含む複雑な効果
- 相手に選択させる効果
- カード公開/非公開の厳密な制御
- 公式レギュレーションごとのデッキ検証
- 再接続時の完全復帰
- 観戦者対策
- チート対策
- 専用 MQTT ブローカーと認証

## ライセンス方針

このテンプレート自体は学習・プロトタイプ用途です。公開する場合は、自分のリポジトリで適切なライセンスを設定してください。

公式 IP や第三者の素材を追加する場合、その素材のライセンスと利用条件に従ってください。

## 公式データを変換する補助ツール

`tools/convert-pokemon-tcg-data.mjs` を同梱しています。

これはカード画像や公式データをダウンロードするツールではありません。自分で取得した JSON データを、ゲーム用の軽量形式へ変換するだけです。

例:

```bash
node tools/convert-pokemon-tcg-data.mjs ./raw-cards ./docs/data/cards-lite.json
```

変換後も、カードテキストは自動でゲーム効果にはなりません。`unmapped: true` が付いたカードは、`docs/js/rules-engine.js` に個別の処理を実装する必要があります。
