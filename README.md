# Fluxtech 品牌網站

一頁式靜態品牌網站，不需要建置工具或後端即可部署。直接開啟 `index.html` 也能預覽；使用本機伺服器可更接近正式上線環境。

## 本機預覽

```bash
python3 -m http.server 4173
```

開啟 `http://localhost:4173`。

## 上線前設定

1. 在 `site-config.js` 確認 LINE 官方帳號連結並替換 GA4 Measurement ID。
2. 在 `index.html`、`robots.txt`、`sitemap.xml` 替換正式網域與公司資料。
3. 替換客戶案例與自有產品的縮圖、名稱、摘要與狀態。
4. 以正式網域完成 Google Search Console 驗證並提交 `sitemap.xml`。
5. 在 GA4 將 `line_consult_click` 標記為重要事件，並以 DebugView 驗證事件參數。

## 重要事件

- `line_consult_click`：參數 `placement`

瀏覽器也會同步派送 `fluxtech:analytics` 自訂事件，方便在尚未填入 GA4 ID 時本機測試。
