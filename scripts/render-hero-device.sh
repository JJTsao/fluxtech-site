#!/bin/zsh

set -euo pipefail

SCRIPT_DIR="${0:A:h}"
PROJECT_DIR="${SCRIPT_DIR:h}"
ASSET_DIR="${PROJECT_DIR}/assets"
SOURCE_IMAGE="${1:-${ASSET_DIR}/hero-device-v3-clean.png}"
OUTPUT_PNG="${2:-${ASSET_DIR}/hero-device-v3.png}"
OUTPUT_WEBP="${3:-${ASSET_DIR}/hero-device-v3.webp}"
PHONE_VARIANT="${4:-app}"
FONT_MEDIUM="/System/Library/Fonts/STHeiti Medium.ttc"
FONT_LIGHT="/System/Library/Fonts/STHeiti Light.ttc"

phone_overlays=()

if [[ "${PHONE_VARIANT}" == "app" ]]; then
  phone_overlays=(
    -draw "fill '#ffffff' rectangle 1225,352 1462,452"
    -font "${FONT_MEDIUM}" -fill '#171b17'
    -pointsize 18 -annotate +1237+383 '學習總覽'
    -draw "fill '#c8f500' roundrectangle 1236,404 1305,434 14,14"
    -draw "fill '#f0f2ee' roundrectangle 1313,404 1382,434 14,14"
    -draw "fill '#f0f2ee' roundrectangle 1390,404 1459,434 14,14"
    -fill '#171b17' -pointsize 10 -annotate +1247+424 '我的課程'
    -fill '#5e655e' -pointsize 10 -annotate +1324+424 '進度追蹤'
    -fill '#5e655e' -pointsize 10 -annotate +1401+424 '課程資訊'
    -fill '#171b17' -pointsize 14 -annotate +1245+490 '今日任務'
    -pointsize 22 -annotate +1333+533 '3 / 5'
    -fill '#6f776e' -pointsize 10 -annotate +1401+532 '已完成'
    -fill '#171b17' -pointsize 15 -annotate +1236+625 '最新消息'
    -pointsize 12 -annotate +1304+674 '新課程上線'
    -font "${FONT_LIGHT}" -fill '#878e86'
    -pointsize 9 -annotate +1304+694 '查看本週學習內容'
    -font "${FONT_MEDIUM}" -fill '#171b17'
    -pointsize 12 -annotate +1304+758 '活動快訊'
    -font "${FONT_LIGHT}" -fill '#878e86'
    -pointsize 9 -annotate +1304+778 '掌握校園最新消息'
    -font "${FONT_MEDIUM}" -fill '#7d847c'
    -pointsize 8 -annotate +1235+861 '首頁'
    -pointsize 8 -annotate +1293+861 '課程'
    -pointsize 8 -annotate +1352+861 '消息'
    -pointsize 8 -annotate +1410+861 '我的'
  )
fi

magick "${SOURCE_IMAGE}" \
  -font "${FONT_MEDIUM}" -fill '#171b17' \
  -pointsize 28 -annotate +305+178 '啟明學院' \
  -pointsize 16 -annotate +515+176 '關於我們' \
  -pointsize 16 -annotate +638+176 '課程介紹' \
  -pointsize 16 -annotate +761+176 '學習資源' \
  -pointsize 16 -annotate +884+176 '最新消息' \
  -pointsize 16 -annotate +1007+176 '聯絡我們' \
  -pointsize 14 -annotate +1177+177 '報名諮詢' \
  -pointsize 44 -annotate +250+350 '啟動學習力' \
  -pointsize 44 -annotate +250+410 '開創無限可能' \
  -font "${FONT_LIGHT}" -fill '#626962' \
  -pointsize 18 -annotate +250+466 '專業教育・啟發未來' \
  -font "${FONT_MEDIUM}" -fill '#171b17' \
  -pointsize 15 -annotate +266+568 '了解更多' \
  -pointsize 18 -annotate +337+744 '多元課程' \
  -pointsize 18 -annotate +544+744 '專業師資' \
  -pointsize 18 -annotate +751+744 '學習資源' \
  -pointsize 18 -annotate +944+744 '課輔服務' \
  -pointsize 16 -annotate +1137+744 '成效追蹤' \
  -font "${FONT_LIGHT}" -fill '#808780' \
  -pointsize 12 -annotate +337+772 '完整課程規劃' \
  -pointsize 12 -annotate +544+772 '專業教學團隊' \
  -pointsize 12 -annotate +751+772 '豐富線上資源' \
  -pointsize 12 -annotate +944+772 '即時學習支援' \
  -pointsize 11 -annotate +1137+772 '掌握成長進度' \
  "${phone_overlays[@]}" \
  "${OUTPUT_PNG}"

cwebp -quiet -q 90 -alpha_q 100 "${OUTPUT_PNG}" -o "${OUTPUT_WEBP}"

magick identify -format '%f %wx%h %[channels]\n' "${OUTPUT_PNG}" "${OUTPUT_WEBP}"
