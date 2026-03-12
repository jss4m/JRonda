// ======= ui.js =======
import { getRouteColor } from "../style/routeStyle.js";
export function createUI(config) {
  // Fail-safe for stale cached HTML: ensure the kiosk stylesheet is present.
  if (!document.querySelector('link[href$="/src/style/kiosk.css"], link[href="./src/style/kiosk.css"], link[href="/src/style/kiosk.css"]')) {
    const kioskStylesheetLink = document.createElement("link");
    kioskStylesheetLink.rel = "stylesheet";
    kioskStylesheetLink.href = "/src/style/kiosk.css";
    document.head.appendChild(kioskStylesheetLink);
  }

  const {
    onPresetChange = () => {},
    onBusToggle = () => {},
    onRailRouteChange = () => {},
    onReset = () => {},
    onSearchSelect = () => {},
    onLegendRouteSelect = () => {},
    stationOptions = [],
    summaryPanels = [],
  } = config || {};
  const I18N_KEY = "jronda_lang";
  const I18N = {
    en: {
      include_bus: "Include bus routes",
      rail_category_filter: "Rail category filter",
      rail_line: "Rail line",
      search_station: "Search station",
      reset: "Reset",
      auto_reset_active: "Auto reset active",
      tap_station_info: "Tap a station to view details",
      route_info: "Route Info",
      legend_tap: "Legend (tap to highlight)",
      corridor_summaries: "Corridor Summaries",
      no_summarized: "No summarized corridor.",
      start: "Start",
      end: "End",
      tumpat_gemas: "Tumpat - Gemas",
      gemas_woodlands: "Gemas - Woodlands",
      language: "Language",
      no_route_selected: "No route selected.",
      details: "Details",
      view_steps: "View Steps",
      close: "Close",
      selected: "Selected",
      primary_line: "Primary line",
      rail_lines: "Rail lines",
      bus_lines: "Bus lines",
      nearby_poi: "Nearby POI",
      none: "None",
      none_1_4km: "None in 1.4km",
      start_here: "Start here",
      end_here: "End here",
      set_start_here: "Set start here",
      set_end_here: "Set end here",
      poi_category: "POI category",
      nearest_rail: "Nearest rail",
      no_nearby_rail: "No nearby rail station",
      set_destination_near_poi: "Set destination near this POI",
      hoho_weekend_only: "This HOHO route runs only on",
      saturday: "Saturday",
      sunday: "Sunday",
      type_station_name: "Type station name",
      on_label: "ON",
      off_label: "OFF",
      all_rail_routes: "All rail routes",
      route: "Route",
      no_route_detail: "No route detail.",
      no_route_found: "No route found.",
      option: "Option",
      distance: "Distance",
      eta: "ETA",
      transfers: "Transfers",
      shared_corridor_alternatives: "Shared-corridor alternatives",
      modes: "Modes",
      now: "Now",
      arrival: "Arrival",
      walk: "Walk",
      summary: "summary",
      stops: "stops",
      toggle_bus: "Toggle include bus routes",
      filter_rail: "Filter rail route",
      search_station_aria: "Search station",
      reset_map: "Reset map and panel",
      preset_aria: "Use {preset} routing preset",
      sidebar_aria: "Transit controls and route results",
      unknown: "Unknown",
      nearest: "Nearest",
      hoho_not_active: "This HOHO service is not active today.",
      enter_passkey: "Enter kiosk passkey:",
      invalid_passkey_update: "Invalid passkey for kiosk station update.",
      invalid_passkey_clear: "Invalid passkey for kiosk station clear.",
      invalid_passkey_setup: "Invalid passkey for kiosk station setup.",
      station_not_found: "Station not found for kiosk lock.",
      kiosk_station_set: "Kiosk station set to {station}.",
      kiosk_station_cleared: "Fixed kiosk station cleared.",
      select_valid_station: "Please select a valid rail station.",
      you_are_here: "You are here",
      fixed_kiosk_station: "Fixed kiosk station",
      gps_active: "GPS is active.",
      search_rail_station: "Search rail station",
      set_kiosk_station: "Set kiosk station",
      clear_fixed_station: "Clear fixed station",
      tap_here_again: "Tap \"You are here\" again for station lock controls.",
      kiosk_location_setup: "Kiosk Location Setup",
      select_rail_station: "Select a rail station to set as permanent location.",
      set_to_this_station: "Set to this station",
      source_tap: "tap",
      source_search: "search",
      preset_changed: "Preset changed: {preset}",
      bus_routes_included: "Bus routes included",
      bus_routes_hidden: "Bus routes hidden",
      rail_focus: "Rail line focus: {route}",
      rail_focus_cleared: "Rail line focus cleared",
      legend_highlight_reset: "Legend highlight reset",
      legend_highlight: "Legend highlight: {route}",
      session_auto_reset: "Session auto-reset.",
      reset_complete: "Reset complete.",
      auto_reset_due_inactivity: "Auto reset due to inactivity",
      start_end_same: "Start and end cannot be the same station.",
      start_set: "Start set: {station}",
      end_set: "End set: {station}",
      selected_station: "Selected {station} ({label}) via {source}.",
      selected_station_short: "Selected {station} ({label})",
      selected_station_toast: "Selected: {station}",
      no_route_found_filters: "No route found for the selected stations and filters.",
      no_route_found_current_filters: "No route found with current filters.",
      route_options_updated: "Route options updated ({count})",
      rail_fallback_active: "Rail fallback active for {count} stop records.",
      layout_centroid_info: "Map layout: centroid ({lat}, {lon}) with trunk-first directional schematic",
      kiosk_lock_aria: "Kiosk lock",
      kiosk_lock_title: "Kiosk Locked",
      enter_admin_pin: "Enter admin PIN",
      unlock: "Unlock",
      fullscreen: "Fullscreen",
      exit_fullscreen: "Exit FS",
      kiosk_locked: "Kiosk locked",
      session_hidden: "Session hidden. Re-identification required.",
      fullscreen_exited: "Fullscreen exited. Re-identification required.",
      set_admin_pin_prompt: "Set kiosk admin PIN (4-8 digits):",
      pin_format_error: "PIN must be 4-8 digits.",
      confirm_admin_pin_prompt: "Confirm admin PIN:",
      pin_mismatch: "PIN mismatch. Try again.",
      invalid_pin_format: "Invalid PIN format.",
      invalid_pin: "Invalid PIN.",
      enter_pin_exit_fullscreen: "Enter admin PIN to exit fullscreen.",
      poi: "POI",
      mode_label: "mode",
    },
    ms: {
      include_bus: "Sertakan laluan bas",
      rail_category_filter: "Penapis kategori rel",
      rail_line: "Laluan rel",
      search_station: "Cari stesen",
      reset: "Tetap semula",
      auto_reset_active: "Tetap semula automatik aktif",
      tap_station_info: "Sentuh stesen untuk maklumat",
      route_info: "Maklumat Laluan",
      legend_tap: "Petunjuk (sentuh untuk sorot)",
      corridor_summaries: "Ringkasan Koridor",
      no_summarized: "Tiada koridor ringkasan.",
      start: "Mula",
      end: "Tamat",
      tumpat_gemas: "Tumpat - Gemas",
      gemas_woodlands: "Gemas - Woodlands",
      language: "Bahasa",
      no_route_selected: "Tiada laluan dipilih.",
      details: "Butiran",
      view_steps: "Lihat langkah",
      close: "Tutup",
      selected: "Dipilih",
      type_station_name: "Taip nama stesen",
      on_label: "HIDUP",
      off_label: "MATI",
      all_rail_routes: "Semua laluan rel",
      route: "Laluan",
      no_route_detail: "Tiada butiran laluan.",
      no_route_found: "Tiada laluan dijumpai.",
      option: "Pilihan",
      distance: "Jarak",
      eta: "ETA",
      transfers: "Pertukaran",
      shared_corridor_alternatives: "Alternatif koridor kongsi",
      modes: "Mod",
      now: "Sekarang",
      arrival: "Ketibaan",
      walk: "Berjalan",
      summary: "ringkasan",
      stops: "hentian",
      toggle_bus: "Togol laluan bas",
      filter_rail: "Tapis laluan rel",
      search_station_aria: "Cari stesen",
      reset_map: "Tetap semula peta dan panel",
      preset_aria: "Guna pratetap laluan {preset}",
      sidebar_aria: "Kawalan transit dan hasil laluan",
      unknown: "Tidak diketahui",
      nearest: "Terdekat",
      hoho_not_active: "Perkhidmatan HOHO ini tidak aktif hari ini.",
      enter_passkey: "Masukkan kunci kiosk:",
      invalid_passkey_update: "Kunci kiosk tidak sah untuk kemas kini stesen.",
      invalid_passkey_clear: "Kunci kiosk tidak sah untuk kosongkan stesen.",
      invalid_passkey_setup: "Kunci kiosk tidak sah untuk tetapan stesen.",
      station_not_found: "Stesen tidak ditemui untuk kunci kiosk.",
      kiosk_station_set: "Stesen kiosk ditetapkan kepada {station}.",
      kiosk_station_cleared: "Stesen kiosk tetap telah dikosongkan.",
      select_valid_station: "Sila pilih stesen rel yang sah.",
      you_are_here: "Anda di sini",
      fixed_kiosk_station: "Stesen kiosk tetap",
      gps_active: "GPS sedang aktif.",
      search_rail_station: "Cari stesen rel",
      set_kiosk_station: "Tetapkan stesen kiosk",
      clear_fixed_station: "Kosongkan stesen tetap",
      tap_here_again: "Sentuh \"Anda di sini\" sekali lagi untuk kawalan kunci stesen.",
      kiosk_location_setup: "Tetapan Lokasi Kiosk",
      select_rail_station: "Pilih stesen rel untuk dijadikan lokasi tetap.",
      set_to_this_station: "Tetapkan stesen ini",
      source_tap: "sentuh",
      source_search: "carian",
      preset_changed: "Praset ditukar: {preset}",
      bus_routes_included: "Laluan bas disertakan",
      bus_routes_hidden: "Laluan bas disembunyikan",
      rail_focus: "Fokus laluan rel: {route}",
      rail_focus_cleared: "Fokus laluan rel dibersihkan",
      legend_highlight_reset: "Sorotan legenda ditetapkan semula",
      legend_highlight: "Sorotan legenda: {route}",
      session_auto_reset: "Sesi ditetap semula automatik.",
      reset_complete: "Tetap semula selesai.",
      auto_reset_due_inactivity: "Tetap semula automatik kerana tiada aktiviti",
      start_end_same: "Mula dan tamat tidak boleh stesen yang sama.",
      start_set: "Mula ditetapkan: {station}",
      end_set: "Tamat ditetapkan: {station}",
      selected_station: "Dipilih {station} ({label}) melalui {source}.",
      selected_station_short: "Dipilih {station} ({label})",
      selected_station_toast: "Dipilih: {station}",
      no_route_found_filters: "Tiada laluan dijumpai untuk stesen dan penapis dipilih.",
      no_route_found_current_filters: "Tiada laluan dengan penapis semasa.",
      route_options_updated: "Pilihan laluan dikemas kini ({count})",
      rail_fallback_active: "Sandaran rel aktif untuk {count} rekod hentian.",
      layout_centroid_info: "Susun atur peta: pusat ({lat}, {lon}) dengan skematik arah utama",
      kiosk_lock_aria: "Kunci kiosk",
      kiosk_lock_title: "Kiosk Dikunci",
      enter_admin_pin: "Masukkan PIN admin",
      unlock: "Buka kunci",
      fullscreen: "Skrin penuh",
      exit_fullscreen: "Keluar FS",
      kiosk_locked: "Kiosk dikunci",
      session_hidden: "Sesi disembunyikan. Pengenalan semula diperlukan.",
      fullscreen_exited: "Skrin penuh ditutup. Pengenalan semula diperlukan.",
      set_admin_pin_prompt: "Tetapkan PIN admin kiosk (4-8 digit):",
      pin_format_error: "PIN mesti 4-8 digit.",
      confirm_admin_pin_prompt: "Sahkan PIN admin:",
      pin_mismatch: "PIN tidak sepadan. Cuba lagi.",
      invalid_pin_format: "Format PIN tidak sah.",
      invalid_pin: "PIN tidak sah.",
      enter_pin_exit_fullscreen: "Masukkan PIN admin untuk keluar skrin penuh.",
      poi: "POI",
      mode_label: "mod",
    },
    zh: {
      include_bus: "包含巴士路线",
      rail_category_filter: "铁路类别筛选",
      rail_line: "铁路线路",
      search_station: "搜索车站",
      reset: "重置",
      auto_reset_active: "自动重置已启用",
      tap_station_info: "点击车站查看信息",
      route_info: "路线信息",
      legend_tap: "图例（点击高亮）",
      corridor_summaries: "走廊摘要",
      no_summarized: "暂无摘要走廊。",
      start: "起点",
      end: "终点",
      tumpat_gemas: "丹帕 - 金马士",
      gemas_woodlands: "金马士 - 兀兰",
      language: "语言",
      no_route_selected: "未选择路线。",
      details: "详情",
      view_steps: "查看步骤",
      close: "关闭",
      selected: "已选择",
      primary_line: "主干线",
      rail_lines: "铁路线路",
      bus_lines: "巴士线路",
      nearby_poi: "附近POI",
      none: "无",
      none_1_4km: "1.4公里内无",
      start_here: "从这里开始",
      end_here: "到这里结束",
      set_start_here: "设为起点",
      set_end_here: "设为终点",
      poi_category: "POI类别",
      nearest_rail: "最近铁路",
      no_nearby_rail: "附近无铁路车站",
      set_destination_near_poi: "将终点设在此POI附近",
      hoho_weekend_only: "此HOHO线路仅在",
      saturday: "周六",
      sunday: "周日",
      type_station_name: "输入车站名称",
      on_label: "开",
      off_label: "关",
      all_rail_routes: "所有铁路线路",
      route: "路线",
      no_route_detail: "无路线详情。",
      no_route_found: "未找到路线。",
      option: "选项",
      distance: "距离",
      eta: "预计时间",
      transfers: "换乘",
      shared_corridor_alternatives: "共享走廊备选",
      modes: "交通方式",
      now: "现在",
      arrival: "到达",
      walk: "步行",
      summary: "摘要",
      stops: "站点",
      toggle_bus: "切换包含巴士路线",
      filter_rail: "筛选铁路线路",
      search_station_aria: "搜索车站",
      reset_map: "重置地图和面板",
      preset_aria: "使用{preset}路线预设",
      sidebar_aria: "交通控制与路线结果",
      unknown: "未知",
      nearest: "最近",
      hoho_not_active: "今日HOHO服务未运行。",
      enter_passkey: "输入自助终端口令：",
      invalid_passkey_update: "更新终端车站口令无效。",
      invalid_passkey_clear: "清除终端车站口令无效。",
      invalid_passkey_setup: "设置终端车站口令无效。",
      station_not_found: "未找到用于终端锁定的车站。",
      kiosk_station_set: "终端车站设为{station}。",
      kiosk_station_cleared: "固定终端车站已清除。",
      select_valid_station: "请选择有效的铁路车站。",
      you_are_here: "您在这里",
      fixed_kiosk_station: "固定终端车站",
      gps_active: "GPS已启用。",
      search_rail_station: "搜索铁路车站",
      set_kiosk_station: "设置终端车站",
      clear_fixed_station: "清除固定车站",
      tap_here_again: "再次点击“您在这里”以进行车站锁定控制。",
      kiosk_location_setup: "终端位置设置",
      select_rail_station: "选择铁路车站作为固定位置。",
      set_to_this_station: "设为该车站",
      source_tap: "点击",
      source_search: "搜索",
      preset_changed: "预设已更改：{preset}",
      bus_routes_included: "已包含巴士路线",
      bus_routes_hidden: "已隐藏巴士路线",
      rail_focus: "铁路线路聚焦：{route}",
      rail_focus_cleared: "铁路线路聚焦已清除",
      legend_highlight_reset: "图例高亮已重置",
      legend_highlight: "图例高亮：{route}",
      session_auto_reset: "会话已自动重置。",
      reset_complete: "重置完成。",
      auto_reset_due_inactivity: "因无操作自动重置",
      start_end_same: "起点和终点不能是同一车站。",
      start_set: "起点已设：{station}",
      end_set: "终点已设：{station}",
      selected_station: "已选择{station}（{label}），来源：{source}。",
      selected_station_short: "已选择{station}（{label}）",
      selected_station_toast: "已选择：{station}",
      no_route_found_filters: "所选车站和筛选条件下未找到路线。",
      no_route_found_current_filters: "当前筛选条件下未找到路线。",
      route_options_updated: "路线选项已更新（{count}）",
      rail_fallback_active: "已启用铁路备用数据，共{count}条停靠记录。",
      layout_centroid_info: "地图布局：中心点（{lat}, {lon}），主干优先方向式示意图",
      kiosk_lock_aria: "终端锁定",
      kiosk_lock_title: "终端已锁定",
      enter_admin_pin: "输入管理员PIN",
      unlock: "解锁",
      fullscreen: "全屏",
      exit_fullscreen: "退出全屏",
      kiosk_locked: "终端已锁定",
      session_hidden: "会话已隐藏。需要重新验证。",
      fullscreen_exited: "已退出全屏。需要重新验证。",
      set_admin_pin_prompt: "设置终端管理员PIN（4-8位数字）：",
      pin_format_error: "PIN必须为4-8位数字。",
      confirm_admin_pin_prompt: "确认管理员PIN：",
      pin_mismatch: "PIN不匹配。请重试。",
      invalid_pin_format: "PIN格式无效。",
      invalid_pin: "PIN无效。",
      enter_pin_exit_fullscreen: "输入管理员PIN以退出全屏。",
      poi: "POI",
      mode_label: "模式",
    },
    yue: {
      include_bus: "包括巴士路線",
      rail_category_filter: "鐵路分類篩選",
      rail_line: "鐵路線",
      search_station: "搜尋車站",
      reset: "重設",
      auto_reset_active: "自動重設已啟用",
      tap_station_info: "點選車站查看資料",
      route_info: "路線資訊",
      legend_tap: "圖例（點選高亮）",
      corridor_summaries: "走廊摘要",
      no_summarized: "冇摘要走廊。",
      start: "起點",
      end: "終點",
      tumpat_gemas: "丹帕 - 金馬士",
      gemas_woodlands: "金馬士 - 兀蘭",
      language: "語言",
      no_route_selected: "未選擇路線。",
      details: "詳情",
      view_steps: "查看步驟",
      close: "關閉",
      selected: "已選",
      primary_line: "主幹線",
      rail_lines: "鐵路線",
      bus_lines: "巴士線",
      nearby_poi: "附近POI",
      none: "冇",
      none_1_4km: "1.4公里內冇",
      start_here: "由呢度開始",
      end_here: "到呢度結束",
      set_start_here: "設為起點",
      set_end_here: "設為終點",
      poi_category: "POI類別",
      nearest_rail: "最近鐵路",
      no_nearby_rail: "附近冇鐵路車站",
      set_destination_near_poi: "將終點設喺呢個POI附近",
      hoho_weekend_only: "呢條HOHO路線只喺",
      saturday: "星期六",
      sunday: "星期日",
      type_station_name: "輸入車站名稱",
      on_label: "開",
      off_label: "關",
      all_rail_routes: "全部鐵路線",
      route: "路線",
      no_route_detail: "冇路線詳情。",
      no_route_found: "搵唔到路線。",
      option: "選項",
      distance: "距離",
      eta: "預計時間",
      transfers: "轉乘",
      shared_corridor_alternatives: "共享走廊替代",
      modes: "交通方式",
      now: "而家",
      arrival: "到達",
      walk: "步行",
      summary: "摘要",
      stops: "站",
      toggle_bus: "切換包括巴士路線",
      filter_rail: "篩選鐵路線",
      search_station_aria: "搜尋車站",
      reset_map: "重設地圖同面板",
      preset_aria: "使用{preset}路線預設",
      sidebar_aria: "交通控制同路線結果",
      unknown: "未知",
      nearest: "最近",
      hoho_not_active: "今日HOHO服務未運行。",
      enter_passkey: "輸入口令：",
      invalid_passkey_update: "更新車站口令無效。",
      invalid_passkey_clear: "清除車站口令無效。",
      invalid_passkey_setup: "設定車站口令無效。",
      station_not_found: "搵唔到車站作鎖定。",
      kiosk_station_set: "終端車站設為{station}。",
      kiosk_station_cleared: "已清除固定終端車站。",
      select_valid_station: "請選有效鐵路車站。",
      you_are_here: "你喺呢度",
      fixed_kiosk_station: "固定終端車站",
      gps_active: "GPS已啟用。",
      search_rail_station: "搜尋鐵路車站",
      set_kiosk_station: "設定終端車站",
      clear_fixed_station: "清除固定車站",
      tap_here_again: "再點一次「你喺呢度」以開啟鎖站控制。",
      kiosk_location_setup: "終端位置設定",
      select_rail_station: "選擇鐵路車站作固定位置。",
      set_to_this_station: "設為此車站",
      source_tap: "點選",
      source_search: "搜尋",
      preset_changed: "預設已更改：{preset}",
      bus_routes_included: "已包含巴士路線",
      bus_routes_hidden: "已隱藏巴士路線",
      rail_focus: "鐵路聚焦：{route}",
      rail_focus_cleared: "鐵路聚焦已清除",
      legend_highlight_reset: "圖例高亮已重設",
      legend_highlight: "圖例高亮：{route}",
      session_auto_reset: "會話已自動重設。",
      reset_complete: "重設完成。",
      auto_reset_due_inactivity: "因無操作自動重設",
      start_end_same: "起點同終點唔可以係同一車站。",
      start_set: "起點已設：{station}",
      end_set: "終點已設：{station}",
      selected_station: "已選擇{station}（{label}），來源：{source}。",
      selected_station_short: "已選擇{station}（{label}）",
      selected_station_toast: "已選擇：{station}",
      no_route_found_filters: "所選車站同篩選條件下搵唔到路線。",
      no_route_found_current_filters: "現有篩選條件下搵唔到路線。",
      route_options_updated: "路線選項已更新（{count}）",
      rail_fallback_active: "已啟用鐵路備用資料，共{count}條停靠記錄。",
      layout_centroid_info: "地圖布局：中心（{lat}, {lon}），主幹優先方向式示意圖",
      kiosk_lock_aria: "終端鎖定",
      kiosk_lock_title: "終端已鎖定",
      enter_admin_pin: "輸入管理員PIN",
      unlock: "解鎖",
      fullscreen: "全螢幕",
      exit_fullscreen: "退出全螢幕",
      kiosk_locked: "終端已鎖定",
      session_hidden: "會話已隱藏，需要重新驗證。",
      fullscreen_exited: "已退出全螢幕，需要重新驗證。",
      set_admin_pin_prompt: "設定終端管理員PIN（4-8位數字）：",
      pin_format_error: "PIN必須為4-8位數字。",
      confirm_admin_pin_prompt: "確認管理員PIN：",
      pin_mismatch: "PIN不一致，請再試。",
      invalid_pin_format: "PIN格式無效。",
      invalid_pin: "PIN無效。",
      enter_pin_exit_fullscreen: "輸入管理員PIN以退出全螢幕。",
      poi: "POI",
      mode_label: "模式",
    },
    ta: {
      include_bus: "பஸ் வழிகளை சேர்க்கவும்",
      rail_category_filter: "ரெயில் வகை வடிகட்டி",
      rail_line: "ரெயில் பாதை",
      search_station: "நிலையத்தை தேடுங்கள்",
      reset: "மீட்டமை",
      auto_reset_active: "தானியங்கி மீட்டமை செயல்பாட்டில்",
      tap_station_info: "தகவலுக்கு நிலையத்தைத் தொடவும்",
      route_info: "வழி தகவல்",
      legend_tap: "சின்ன விளக்கம் (தொட்டி ஒளிரச் செய்யவும்)",
      corridor_summaries: "கோரிடார் சுருக்கங்கள்",
      no_summarized: "சுருக்கமான கோரிடார் இல்லை.",
      start: "தொடக்கம்",
      end: "முடிவு",
      tumpat_gemas: "தும்பாட் - கேமாஸ்",
      gemas_woodlands: "கேமாஸ் - உட்லண்ட்ஸ்",
      language: "மொழி",
      no_route_selected: "வழி தேர்ந்தெடுக்கப்படவில்லை.",
      details: "விவரங்கள்",
      view_steps: "அடிகளை காண்க",
      close: "மூடு",
      selected: "தேர்வு செய்யப்பட்டது",
      primary_line: "முக்கிய வழி",
      rail_lines: "ரெயில் வழிகள்",
      bus_lines: "பஸ் வழிகள்",
      nearby_poi: "அருகிலுள்ள POI",
      none: "இல்லை",
      none_1_4km: "1.4 கிமீ உள்ளில் இல்லை",
      start_here: "இங்கே தொடங்கு",
      end_here: "இங்கே முடி",
      set_start_here: "தொடக்கம் இங்கே",
      set_end_here: "முடிவு இங்கே",
      poi_category: "POI வகை",
      nearest_rail: "அருகிலுள்ள ரெயில்",
      no_nearby_rail: "அருகில் ரெயில் நிலையம் இல்லை",
      set_destination_near_poi: "இந்த POI அருகே இலக்கு அமைக்கவும்",
      hoho_weekend_only: "இந்த HOHO வழி மட்டும் இயங்கும் நாள்",
      saturday: "சனி",
      sunday: "ஞாயிறு",
      type_station_name: "நிலையப் பெயரை உள்ளிடவும்",
      on_label: "ஆன்",
      off_label: "ஆஃப்",
      all_rail_routes: "அனைத்து ரெயில் வழிகள்",
      route: "வழி",
      no_route_detail: "வழி விவரம் இல்லை.",
      no_route_found: "வழி கிடைக்கவில்லை.",
      option: "விருப்பம்",
      distance: "தூரம்",
      eta: "ETA",
      transfers: "மாற்றங்கள்",
      shared_corridor_alternatives: "பகிரப்பட்ட கோரிடார் மாற்றுகள்",
      modes: "முறைகள்",
      now: "இப்போது",
      arrival: "வருகை",
      walk: "நட",
      summary: "சுருக்கம்",
      stops: "நிறுத்தங்கள்",
      toggle_bus: "பஸ் வழிகள் சேர்க்கை மாற்று",
      filter_rail: "ரெயில் வழி வடிகட்டி",
      search_station_aria: "நிலையத்தை தேடு",
      reset_map: "வரைபடம் மற்றும் பலகையை மீட்டமை",
      preset_aria: "{preset} வழி முன் அமைப்பு பயன்படுத்தவும்",
      sidebar_aria: "டிரான்சிட் கட்டுப்பாடுகள் மற்றும் வழி முடிவுகள்",
      unknown: "அறியப்படாதது",
      nearest: "அருகிலுள்ள",
      hoho_not_active: "இன்று HOHO சேவை செயலிலில்லை.",
      enter_passkey: "கியாஸ்க் கடவுச்சொல்லை உள்ளிடவும்:",
      invalid_passkey_update: "கியாஸ்க் நிலையம் புதுப்பிப்பு கடவுச்சொல் தவறு.",
      invalid_passkey_clear: "கியாஸ்க் நிலையம் நீக்கும் கடவுச்சொல் தவறு.",
      invalid_passkey_setup: "கியாஸ்க் நிலையம் அமைப்பு கடவுச்சொல் தவறு.",
      station_not_found: "கியாஸ்க் பூட்ட کیلئے நிலையம் கிடைக்கவில்லை.",
      kiosk_station_set: "கியாஸ்க் நிலையம் {station} ஆக அமைக்கப்பட்டது.",
      kiosk_station_cleared: "நிலைத்த கியாஸ்க் நிலையம் நீக்கப்பட்டது.",
      select_valid_station: "செல்லுபடியாகும் ரெயில் நிலையத்தை தேர்ந்தெடுக்கவும்.",
      you_are_here: "நீங்கள் இங்கே",
      fixed_kiosk_station: "நிலைத்த கியாஸ்க் நிலையம்",
      gps_active: "GPS செயல்பாட்டில் உள்ளது.",
      search_rail_station: "ரெயில் நிலையத்தை தேடு",
      set_kiosk_station: "கியாஸ்க் நிலையத்தை அமைக்கவும்",
      clear_fixed_station: "நிலைத்த நிலையத்தை நீக்கு",
      tap_here_again: "\"நீங்கள் இங்கே\" என்பதை மீண்டும் தொட்டு பூட்டு கட்டுப்பாடுகளை திறக்கவும்.",
      kiosk_location_setup: "கியாஸ்க் இடம் அமைப்பு",
      select_rail_station: "நிலையான இடமாக அமைக்க ரெயில் நிலையத்தை தேர்ந்தெடுக்கவும்.",
      set_to_this_station: "இந்த நிலையமாக அமைக்கவும்",
      source_tap: "தொடு",
      source_search: "தேடல்",
      preset_changed: "முன் அமைப்பு மாற்றப்பட்டது: {preset}",
      bus_routes_included: "பஸ் வழிகள் சேர்க்கப்பட்டது",
      bus_routes_hidden: "பஸ் வழிகள் மறைக்கப்பட்டது",
      rail_focus: "ரெயில் கவனம்: {route}",
      rail_focus_cleared: "ரெயில் கவனம் நீக்கப்பட்டது",
      legend_highlight_reset: "சின்ன விளக்கம் ஒளிர்வு மீட்டமைக்கப்பட்டது",
      legend_highlight: "சின்ன விளக்கம் ஒளிர்வு: {route}",
      session_auto_reset: "அமர்வு தானாக மீட்டமைக்கப்பட்டது.",
      reset_complete: "மீட்டமை முடிந்தது.",
      auto_reset_due_inactivity: "செயல்பாடு இல்லாததால் தானியங்கி மீட்டமை",
      start_end_same: "தொடக்கம் மற்றும் முடிவு ஒரே நிலையமாக இருக்க முடியாது.",
      start_set: "தொடக்கம் அமைக்கப்பட்டது: {station}",
      end_set: "முடிவு அமைக்கப்பட்டது: {station}",
      selected_station: "{station} ({label}) தேர்ந்தெடுக்கப்பட்டது, மூலம்: {source}.",
      selected_station_short: "{station} ({label}) தேர்ந்தெடுக்கப்பட்டது",
      selected_station_toast: "தேர்வு: {station}",
      no_route_found_filters: "தேர்ந்தெடுக்கப்பட்ட நிலையங்கள் மற்றும் வடிகட்டிகளில் வழி கிடைக்கவில்லை.",
      no_route_found_current_filters: "தற்போதைய வடிகட்டிகளில் வழி கிடைக்கவில்லை.",
      route_options_updated: "வழி விருப்பங்கள் புதுப்பிக்கப்பட்டது ({count})",
      rail_fallback_active: "{count} நிறுத்த பதிவுகளுக்கு ரெயில் காப்பு செயல்பாட்டில் உள்ளது.",
      layout_centroid_info: "வரைபட அமைப்பு: மையம் ({lat}, {lon}) மற்றும் முதன்மை திசை வடிவம்",
      kiosk_lock_aria: "கியாஸ்க் பூட்டு",
      kiosk_lock_title: "கியாஸ்க் பூட்டப்பட்டுள்ளது",
      enter_admin_pin: "நிர்வாக PIN உள்ளிடவும்",
      unlock: "பூட்டை திற",
      fullscreen: "முழுத்திரை",
      exit_fullscreen: "முழுத்திரையை விட்டு வெளியேறு",
      kiosk_locked: "கியாஸ்க் பூட்டப்பட்டது",
      session_hidden: "அமர்வு மறைக்கப்பட்டது. மறுஅடையாளம் தேவை.",
      fullscreen_exited: "முழுத்திரை வெளியேற்றப்பட்டது. மறுஅடையாளம் தேவை.",
      set_admin_pin_prompt: "கியாஸ்க் நிர்வாக PIN அமைக்கவும் (4-8 இலக்கங்கள்):",
      pin_format_error: "PIN 4-8 இலக்கங்கள் ஆக இருக்க வேண்டும்.",
      confirm_admin_pin_prompt: "நிர்வாக PIN உறுதிப்படுத்தவும்:",
      pin_mismatch: "PIN பொருந்தவில்லை. மீண்டும் முயற்சிக்கவும்.",
      invalid_pin_format: "PIN வடிவம் தவறானது.",
      invalid_pin: "PIN தவறானது.",
      enter_pin_exit_fullscreen: "முழுத்திரை வெளியேற நிர்வாக PIN உள்ளிடவும்.",
      poi: "POI",
      mode_label: "முறை",
    },
    ar: {
      include_bus: "تضمين مسارات الحافلات",
      rail_category_filter: "تصفية فئة السكك الحديدية",
      rail_line: "خط السكك الحديدية",
      search_station: "ابحث عن محطة",
      reset: "إعادة ضبط",
      auto_reset_active: "إعادة الضبط التلقائي مفعّلة",
      tap_station_info: "اضغط على محطة لعرض المعلومات",
      route_info: "معلومات المسار",
      legend_tap: "الدليل (اضغط للإبراز)",
      corridor_summaries: "ملخصات الممرات",
      no_summarized: "لا يوجد ممر ملخص.",
      start: "بداية",
      end: "نهاية",
      tumpat_gemas: "تمبات - جيماس",
      gemas_woodlands: "جيماس - وودلاندز",
      language: "اللغة",
      no_route_selected: "لم يتم اختيار مسار.",
      details: "تفاصيل",
      view_steps: "عرض الخطوات",
      close: "إغلاق",
      selected: "محدد",
      primary_line: "الخط الرئيسي",
      rail_lines: "خطوط السكك",
      bus_lines: "خطوط الحافلات",
      nearby_poi: "معالم قريبة",
      none: "لا يوجد",
      none_1_4km: "لا يوجد ضمن 1.4 كم",
      start_here: "ابدأ من هنا",
      end_here: "انهِ هنا",
      set_start_here: "تعيين البداية هنا",
      set_end_here: "تعيين النهاية هنا",
      poi_category: "فئة المعلم",
      nearest_rail: "أقرب سكة",
      no_nearby_rail: "لا توجد محطة سكك قريبة",
      set_destination_near_poi: "تعيين الوجهة قرب هذا المعلم",
      hoho_weekend_only: "مسار HOHO يعمل فقط يوم",
      saturday: "السبت",
      sunday: "الأحد",
      type_station_name: "اكتب اسم المحطة",
      on_label: "تشغيل",
      off_label: "إيقاف",
      all_rail_routes: "كل خطوط السكك",
      route: "مسار",
      no_route_detail: "لا توجد تفاصيل للمسار.",
      no_route_found: "لم يتم العثور على مسار.",
      option: "خيار",
      distance: "المسافة",
      eta: "الوقت المتوقع",
      transfers: "تحويلات",
      shared_corridor_alternatives: "بدائل الممر المشترك",
      modes: "الوسائط",
      now: "الآن",
      arrival: "الوصول",
      walk: "امشِ",
      summary: "ملخص",
      stops: "محطات",
      toggle_bus: "تبديل تضمين الحافلات",
      filter_rail: "تصفية خط السكك",
      search_station_aria: "ابحث عن محطة",
      reset_map: "إعادة ضبط الخريطة واللوحة",
      preset_aria: "استخدم الإعداد المسبق {preset}",
      sidebar_aria: "عناصر التحكم والنتائج",
      unknown: "غير معروف",
      nearest: "الأقرب",
      hoho_not_active: "خدمة HOHO غير نشطة اليوم.",
      enter_passkey: "أدخل كلمة مرور الكشك:",
      invalid_passkey_update: "كلمة المرور غير صالحة لتحديث المحطة.",
      invalid_passkey_clear: "كلمة المرور غير صالحة لمسح المحطة.",
      invalid_passkey_setup: "كلمة المرور غير صالحة لإعداد المحطة.",
      station_not_found: "لم يتم العثور على محطة لقفل الكشك.",
      kiosk_station_set: "تم تعيين محطة الكشك إلى {station}.",
      kiosk_station_cleared: "تم مسح محطة الكشك الثابتة.",
      select_valid_station: "يرجى اختيار محطة سكك صالحة.",
      you_are_here: "أنت هنا",
      fixed_kiosk_station: "محطة كشك ثابتة",
      gps_active: "نظام GPS نشط.",
      search_rail_station: "ابحث عن محطة سكك",
      set_kiosk_station: "تعيين محطة الكشك",
      clear_fixed_station: "مسح المحطة الثابتة",
      tap_here_again: "اضغط \"أنت هنا\" مرة أخرى لإعدادات القفل.",
      kiosk_location_setup: "إعداد موقع الكشك",
      select_rail_station: "اختر محطة سكك لتثبيتها كموقع دائم.",
      set_to_this_station: "تعيين لهذه المحطة",
      source_tap: "نقر",
      source_search: "بحث",
      preset_changed: "تم تغيير الإعداد المسبق: {preset}",
      bus_routes_included: "تم تضمين مسارات الحافلات",
      bus_routes_hidden: "تم إخفاء مسارات الحافلات",
      rail_focus: "تركيز خط السكك: {route}",
      rail_focus_cleared: "تم مسح تركيز خط السكك",
      legend_highlight_reset: "تم إعادة تعيين إبراز الدليل",
      legend_highlight: "إبراز الدليل: {route}",
      session_auto_reset: "تمت إعادة ضبط الجلسة تلقائياً.",
      reset_complete: "اكتملت إعادة الضبط.",
      auto_reset_due_inactivity: "إعادة ضبط تلقائية بسبب عدم النشاط",
      start_end_same: "لا يمكن أن تكون البداية والنهاية نفس المحطة.",
      start_set: "تم تعيين البداية: {station}",
      end_set: "تم تعيين النهاية: {station}",
      selected_station: "تم اختيار {station} ({label}) عبر {source}.",
      selected_station_short: "تم اختيار {station} ({label})",
      selected_station_toast: "تم اختيار: {station}",
      no_route_found_filters: "لم يتم العثور على مسار للمحطات والمرشحات المحددة.",
      no_route_found_current_filters: "لم يتم العثور على مسار مع المرشحات الحالية.",
      route_options_updated: "تم تحديث خيارات المسار ({count})",
      rail_fallback_active: "تم تفعيل النسخة الاحتياطية للسكك لـ {count} سجل توقف.",
      layout_centroid_info: "تخطيط الخريطة: المركز ({lat}, {lon}) مع مخطط اتجاهي يعتمد على الخط الرئيسي",
      kiosk_lock_aria: "قفل الكشك",
      kiosk_lock_title: "الكشك مقفل",
      enter_admin_pin: "أدخل رقم PIN للمسؤول",
      unlock: "فتح",
      fullscreen: "ملء الشاشة",
      exit_fullscreen: "الخروج من ملء الشاشة",
      kiosk_locked: "الكشك مقفل",
      session_hidden: "تم إخفاء الجلسة. مطلوب إعادة التحقق.",
      fullscreen_exited: "تم الخروج من ملء الشاشة. مطلوب إعادة التحقق.",
      set_admin_pin_prompt: "تعيين رقم PIN للمسؤول (4-8 أرقام):",
      pin_format_error: "يجب أن يكون PIN من 4 إلى 8 أرقام.",
      confirm_admin_pin_prompt: "تأكيد رقم PIN للمسؤول:",
      pin_mismatch: "عدم تطابق PIN. حاول مرة أخرى.",
      invalid_pin_format: "تنسيق PIN غير صالح.",
      invalid_pin: "PIN غير صالح.",
      enter_pin_exit_fullscreen: "أدخل PIN المسؤول للخروج من ملء الشاشة.",
      poi: "POI",
      mode_label: "النمط",
    },
  };
  let lang = localStorage.getItem(I18N_KEY) || "en";
  if (!I18N[lang]) lang = "en";
  const t = (key, fallback = "") => I18N[lang]?.[key] || I18N.en[key] || fallback || key;
  const tf = (key, fallback, params = {}) => {
    let out = t(key, fallback);
    for (const [pKey, pValue] of Object.entries(params)) {
      out = out.replace(new RegExp(`\\{${pKey}\\}`, "g"), String(pValue));
    }
    return out;
  };
  window.jrondaI18n = { t, getLang: () => lang };

  const map = document.getElementById("map");

  const root = document.createElement("div");
  root.id = "kiosk-root";

  const mapWrap = document.createElement("div");
  mapWrap.id = "kiosk-map-wrap";
  const mapSurface = document.createElement("div");
  mapSurface.id = "kiosk-map-surface";
  const clockWidget = document.createElement("div");
  clockWidget.id = "kiosk-clock";
  clockWidget.setAttribute("aria-live", "off");
  clockWidget.innerHTML = `
    <div class="kiosk-clock-grid">
      <div id="kiosk-clock-day" class="kiosk-clock-day">-</div>
      <div class="kiosk-clock-right">
        <div id="kiosk-clock-date" class="kiosk-clock-date">-- -- ----</div>
        <div id="kiosk-clock-time" class="kiosk-clock-time">--:--:--</div>
      </div>
    </div>
  `;
  const legendDock = document.createElement("div");
  legendDock.id = "map-legend-dock";

  const sidebar = document.createElement("aside");
  sidebar.id = "kiosk-sidebar";
  sidebar.setAttribute("aria-label", t("sidebar_aria", "Transit controls and route results"));

  if (map) mapSurface.appendChild(map);
  mapSurface.appendChild(clockWidget);
  mapWrap.appendChild(mapSurface);
  mapWrap.appendChild(legendDock);
  root.appendChild(mapWrap);
  root.appendChild(sidebar);
  document.body.appendChild(root);

  const controlBlock = document.createElement("div");
  controlBlock.className = "panel-block";
  sidebar.appendChild(controlBlock);

  const presetRow = document.createElement("div");
  presetRow.className = "control-row-presets";
  controlBlock.appendChild(presetRow);

  const langRow = document.createElement("div");
  langRow.className = "control-row-language";
  controlBlock.appendChild(langRow);
  const langLabel = document.createElement("label");
  langLabel.setAttribute("for", "jronda-language");
  langLabel.className = "label-strong";
  langRow.appendChild(langLabel);
  const langSelect = document.createElement("select");
  langSelect.id = "jronda-language";
  langSelect.className = "sr-control";
  const langOptions = [
    ["en", "English"],
    ["ms", "Bahasa Melayu"],
    ["zh", "Mandarin"],
    ["yue", "Cantonese"],
    ["ta", "Tamil"],
    ["ar", "Arabic"],
  ];
  for (const [value, label] of langOptions) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = label;
    langSelect.appendChild(opt);
  }
  langSelect.value = lang;
  langSelect.onchange = () => {
    lang = langSelect.value || "en";
    localStorage.setItem(I18N_KEY, lang);
    window.jrondaI18n = { t, getLang: () => lang };
    applyI18n();
    updateKioskClock();
    window.dispatchEvent(new CustomEvent("jronda:lang-changed", { detail: { lang } }));
  };
  langRow.appendChild(langSelect);

  const presets = [
    { id: "SMART", label: "Smart" },
    { id: "FAST", label: "Fast" },
    { id: "BUDGET", label: "Budget" },
  ];
  const presetButtons = new Map();
  function setActivePreset(presetId) {
    for (const [id, btn] of presetButtons.entries()) {
      const active = id === presetId;
      btn.classList.toggle("primary", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    }
  }
  presets.forEach((p) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sr-btn";
    btn.textContent = p.label;
    btn.setAttribute("aria-label", tf("preset_aria", "Use {preset} routing preset", { preset: p.label }));
    btn.onclick = () => {
      setActivePreset(p.id);
      onPresetChange(p.id);
    };
    presetButtons.set(p.id, btn);
    presetRow.appendChild(btn);
  });
  setActivePreset("SMART");

  const optionsRow = document.createElement("div");
  optionsRow.className = "control-row-options";
  controlBlock.appendChild(optionsRow);

  const busLabel = document.createElement("label");
  busLabel.setAttribute("for", "jronda-bus-toggle");
  busLabel.textContent = t("include_bus", "Include bus routes");
  busLabel.className = "label-strong";
  optionsRow.appendChild(busLabel);

  let includeBus = true;
  const busBtn = document.createElement("button");
  busBtn.type = "button";
  busBtn.id = "jronda-bus-toggle";
  busBtn.className = "sr-btn primary";
  busBtn.textContent = t("on_label", "ON");
  busBtn.setAttribute("aria-label", t("toggle_bus", "Toggle include bus routes"));
  busBtn.onclick = () => {
    includeBus = !includeBus;
    busBtn.textContent = includeBus ? t("on_label", "ON") : t("off_label", "OFF");
    busBtn.classList.toggle("primary", includeBus);
    onBusToggle(includeBus);
  };
  optionsRow.appendChild(busBtn);

  const routeFilterWrap = document.createElement("div");
  routeFilterWrap.className = "control-row-category";
  controlBlock.appendChild(routeFilterWrap);

  const routeLabel = document.createElement("label");
  routeLabel.setAttribute("for", "jronda-route-filter");
  routeLabel.textContent = t("rail_line", "Rail line");
  routeLabel.className = "label-strong";
  routeFilterWrap.appendChild(routeLabel);

  const routeSelect = document.createElement("select");
  routeSelect.id = "jronda-route-filter";
  routeSelect.className = "sr-control";
  routeSelect.setAttribute("aria-label", t("filter_rail", "Filter rail route"));
  routeSelect.disabled = true;
  const routeAllOption = document.createElement("option");
  routeAllOption.value = "";
  routeAllOption.textContent = t("all_rail_routes", "All rail routes");
  routeSelect.appendChild(routeAllOption);
  routeSelect.onchange = () => onRailRouteChange(routeSelect.value || null);
  routeFilterWrap.appendChild(routeSelect);

  const searchWrap = document.createElement("div");
  searchWrap.className = "control-row-search";
  controlBlock.appendChild(searchWrap);

  const searchLabel = document.createElement("label");
  searchLabel.setAttribute("for", "jronda-station-search");
  searchLabel.textContent = t("search_station", "Search station");
  searchLabel.className = "label-strong";
  searchWrap.appendChild(searchLabel);

  const searchInput = document.createElement("input");
  searchInput.id = "jronda-station-search";
  searchInput.className = "sr-control";
  searchInput.type = "text";
  searchInput.placeholder = t("type_station_name", "Type station name");
  searchInput.autocomplete = "off";
  searchInput.setAttribute("aria-autocomplete", "list");
  searchInput.setAttribute("aria-controls", "search-suggestions");
  searchInput.setAttribute("aria-expanded", "false");
  searchInput.setAttribute("aria-label", t("search_station_aria", "Search station"));
  searchWrap.appendChild(searchInput);

  const suggestions = document.createElement("div");
  suggestions.id = "search-suggestions";
  suggestions.setAttribute("role", "listbox");
  searchWrap.appendChild(suggestions);

  const resetRow = document.createElement("div");
  resetRow.className = "control-row-reset";
  controlBlock.appendChild(resetRow);

  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.className = "sr-btn";
  resetBtn.textContent = t("reset", "Reset");
  resetBtn.setAttribute("aria-label", t("reset_map", "Reset map and panel"));
  resetBtn.onclick = () => onReset("manual");
  resetRow.appendChild(resetBtn);

  const resetHint = document.createElement("span");
  resetHint.className = "hint-text";
  resetHint.textContent = t("auto_reset_active", "Auto reset active");
  resetRow.appendChild(resetHint);

  const stationInfo = document.createElement("div");
  stationInfo.className = "panel-block";
  stationInfo.setAttribute("aria-live", "polite");
  stationInfo.textContent = t("tap_station_info", "Tap a station to view details");
  sidebar.appendChild(stationInfo);

  const summaryPanel = document.createElement("div");
  summaryPanel.id = "summary-corridor-panel";
  summaryPanel.setAttribute("aria-label", "Summarized corridor routes");
  summaryPanel.hidden = true;
  sidebar.appendChild(summaryPanel);

  const panel = document.createElement("div");
  panel.id = "route-info-panel";
  sidebar.appendChild(panel);

  const title = document.createElement("h4");
  title.textContent = t("route_info", "Route Info");
  title.className = "panel-title";
  panel.appendChild(title);

  const content = document.createElement("div");
  content.id = "route-info-content";
  panel.appendChild(content);

  const routeDetailModal = document.createElement("div");
  routeDetailModal.id = "route-detail-modal";
  routeDetailModal.setAttribute("role", "dialog");
  routeDetailModal.setAttribute("aria-modal", "true");
  routeDetailModal.setAttribute("aria-label", "Route details");
  const routeDetailCard = document.createElement("div");
  routeDetailCard.id = "route-detail-card";
  const routeDetailHead = document.createElement("div");
  routeDetailHead.id = "route-detail-head";
  const routeDetailTitle = document.createElement("div");
  routeDetailTitle.id = "route-detail-title";
  routeDetailTitle.textContent = t("details", "Details");
  const routeDetailClose = document.createElement("button");
  routeDetailClose.type = "button";
  routeDetailClose.className = "sr-btn";
  routeDetailClose.textContent = t("close", "Close");
  routeDetailHead.appendChild(routeDetailTitle);
  routeDetailHead.appendChild(routeDetailClose);
  const routeDetailContent = document.createElement("div");
  routeDetailContent.id = "route-detail-content";
  routeDetailCard.appendChild(routeDetailHead);
  routeDetailCard.appendChild(routeDetailContent);
  routeDetailModal.appendChild(routeDetailCard);
  document.body.appendChild(routeDetailModal);

  const legendPanel = document.createElement("div");
  legendPanel.id = "legend-panel";
  legendPanel.setAttribute("aria-label", "Route legend");
  legendDock.appendChild(legendPanel);

  const legendTitle = document.createElement("div");
  legendTitle.textContent = t("legend_tap", "Legend (tap to highlight)");
  legendTitle.className = "legend-title";
  legendDock.prepend(legendTitle);

  const legendList = document.createElement("div");
  legendList.id = "legend-list";
  legendPanel.appendChild(legendList);
  const legendButtons = new Map();

  function hideRoutePanel() {
    panel.style.display = "none";
    routeDetailModal.style.display = "none";
  }

  function showRoutePanel() {
    panel.style.display = "";
  }

  function closeRouteDetail() {
    routeDetailModal.style.display = "none";
    routeDetailContent.innerHTML = "";
  }

  function openRouteDetail(titleText, detailNode) {
    routeDetailTitle.textContent = titleText || t("details", "Details");
    routeDetailContent.innerHTML = "";
    if (detailNode) routeDetailContent.appendChild(detailNode);
    routeDetailModal.style.display = "flex";
  }

  routeDetailClose.onclick = closeRouteDetail;
  routeDetailModal.addEventListener("click", (evt) => {
    if (evt.target === routeDetailModal) closeRouteDetail();
  });
  window.addEventListener("keydown", (evt) => {
    if (evt.key === "Escape" && routeDetailModal.style.display === "flex") {
      closeRouteDetail();
    }
  });

  const toastRoot = document.createElement("div");
  toastRoot.id = "jronda-toast-root";
  document.body.appendChild(toastRoot);

  function resolveSummaryStopId(panel, row) {
    const byRoute = row?.byRoute || {};
    const routeIds = Array.isArray(panel?.routeIds) ? panel.routeIds : [];
    for (const routeId of routeIds) {
      const sid = byRoute[String(routeId)];
      if (sid) return String(sid);
    }
    const first = Object.values(byRoute)[0];
    return first ? String(first) : "";
  }

  function renderSummaryPanels(panels = []) {
    summaryPanel.innerHTML = "";
    const title = document.createElement("div");
    title.textContent = t("corridor_summaries", "Corridor Summaries");
    title.className = "summary-panel-title";
    summaryPanel.appendChild(title);

    if (!panels.length) {
      const empty = document.createElement("div");
      empty.className = "summary-panel-empty";
      empty.textContent = t("no_summarized", "No summarized corridor.");
      summaryPanel.appendChild(empty);
      return;
    }

    for (const panelData of panels) {
      const card = document.createElement("div");
      card.className = "corridor-card";
      const heading = document.createElement("button");
      heading.type = "button";
      heading.className = "corridor-toggle";
      heading.setAttribute("aria-expanded", "false");
      const corridorKey = String(panelData?.corridorKey || "");
      heading.textContent =
        String(panelData?.placement || "") === "above"
          ? t("tumpat_gemas", "Tumpat - Gemas")
          : (String(panelData?.placement || "") === "below"
            ? t("gemas_woodlands", "Gemas - Woodlands")
            : (corridorKey.includes("butterworth_padang")
              ? "Padang Besar - Butterworth"
              : (corridorKey.includes("butterworth_ipoh")
                ? "Butterworth - Ipoh"
                : (corridorKey.includes("ets_north")
                  ? "ETS North (to 15200)"
                  : (corridorKey.includes("ets_south")
                    ? "ETS South (from 25100)"
                    : "Corridor")))));
      card.appendChild(heading);
      const body = document.createElement("div");
      body.className = "corridor-body";
      body.hidden = true;

      const routeIds = Array.isArray(panelData?.routeIds) ? panelData.routeIds : [];
      const routeLabels = Array.isArray(panelData?.routeLabels) ? panelData.routeLabels : [];
      const routeColors = Array.isArray(panelData?.routeColors) ? panelData.routeColors : [];
      for (let i = 0; i < routeIds.length; i++) {
        const chip = document.createElement("span");
        chip.className = "corridor-route-chip";
        chip.style.background = routeColors[i] || "#607080";
        chip.textContent = routeLabels[i] || routeIds[i] || t("route", "Route");
        body.appendChild(chip);
      }

      const rows = Array.isArray(panelData?.rows) ? panelData.rows : [];
      for (const row of rows) {
        const stopId = resolveSummaryStopId(panelData, row);
        if (!stopId) continue;
        const rowEl = document.createElement("div");
        rowEl.className = "corridor-stop-row";

        const stopName = document.createElement("div");
        stopName.className = "corridor-stop-name";
        stopName.textContent = String(row?.label || "");
        rowEl.appendChild(stopName);

        const startBtn = document.createElement("button");
        startBtn.type = "button";
        startBtn.className = "corridor-mini-btn primary";
        startBtn.textContent = t("start", "Start");
        startBtn.onclick = () => {
          window.dispatchEvent(new CustomEvent("jronda:set-start", { detail: { stopId } }));
        };
        rowEl.appendChild(startBtn);

        const endBtn = document.createElement("button");
        endBtn.type = "button";
        endBtn.className = "corridor-mini-btn";
        endBtn.textContent = t("end", "End");
        endBtn.onclick = () => {
          window.dispatchEvent(new CustomEvent("jronda:set-end", { detail: { stopId } }));
        };
        rowEl.appendChild(endBtn);

        body.appendChild(rowEl);
      }

      heading.onclick = () => {
        const next = body.hidden;
        body.hidden = !next;
        heading.setAttribute("aria-expanded", next ? "true" : "false");
      };
      card.appendChild(body);
      summaryPanel.appendChild(card);
    }
  }

  renderSummaryPanels(summaryPanels);

  const clockDayEl = document.getElementById("kiosk-clock-day");
  const clockDateEl = document.getElementById("kiosk-clock-date");
  const clockTimeEl = document.getElementById("kiosk-clock-time");

  function resolveClockLocale() {
    const mapByLang = {
      en: "en-MY",
      ms: "ms-MY",
      zh: "zh-CN",
      yue: "yue-HK",
      ta: "ta-MY",
      ar: "ar-MY",
    };
    return mapByLang[lang] || "en-MY";
  }

  function formatTwoDigits(value, locale) {
    return new Intl.NumberFormat(locale, {
      minimumIntegerDigits: 2,
      useGrouping: false,
    }).format(value);
  }

  function formatFourDigits(value, locale) {
    return new Intl.NumberFormat(locale, {
      minimumIntegerDigits: 4,
      useGrouping: false,
    }).format(value);
  }

  function updateKioskClock() {
    const now = new Date();
    const locale = resolveClockLocale();
    const dayName = new Intl.DateTimeFormat(locale, { weekday: "long" }).format(now);
    const dayNumber = formatTwoDigits(now.getDate(), locale);
    const monthNumber = formatTwoDigits(now.getMonth() + 1, locale);
    const yearNumber = formatFourDigits(now.getFullYear(), locale);
    const hour = formatTwoDigits(now.getHours(), locale);
    const minute = formatTwoDigits(now.getMinutes(), locale);
    const second = formatTwoDigits(now.getSeconds(), locale);

    if (clockDayEl) clockDayEl.textContent = dayName;
    if (clockDateEl) clockDateEl.textContent = `${dayNumber}-${monthNumber}-${yearNumber}`;
    if (clockTimeEl) clockTimeEl.textContent = `${hour}:${minute}:${second}`;
  }

  updateKioskClock();
  setInterval(updateKioskClock, 1000);

  function applyI18n() {
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    langLabel.textContent = t("language", "Language");
    busLabel.textContent = t("include_bus", "Include bus routes");
    routeLabel.textContent = t("rail_line", "Rail line");
    searchLabel.textContent = t("search_station", "Search station");
    searchInput.placeholder = t("type_station_name", "Type station name");
    resetBtn.textContent = t("reset", "Reset");
    resetHint.textContent = t("auto_reset_active", "Auto reset active");
    const defaultInfo = t("tap_station_info", "Tap a station to view details");
    if (!stationInfo.textContent || stationInfo.textContent === defaultInfo) {
      stationInfo.textContent = defaultInfo;
    }
    title.textContent = t("route_info", "Route Info");
    legendTitle.textContent = t("legend_tap", "Legend (tap to highlight)");
    routeDetailClose.textContent = t("close", "Close");
    if (routeDetailModal.style.display === "flex") {
      routeDetailTitle.textContent = t("details", "Details");
    }
    renderSummaryPanels(summaryPanels);
  }

  function normText(v) {
    return String(v || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  }

  function expandQueryWithSynonyms(rawQuery) {
    const base = normText(rawQuery);
    if (!base) return [];
    const expanded = new Set([base]);
    const tokenSynonyms = new Map([
      ["stesen", "station"],
      ["station", "stesen"],
      ["muzium", "museum"],
      ["museum", "muzium"],
      ["jalan", "jln"],
      ["jln", "jalan"],
      ["kuala lumpur", "kl"],
      ["kl", "kuala lumpur"],
    ]);
    for (const [from, to] of tokenSynonyms.entries()) {
      if (base.includes(from)) expanded.add(base.replaceAll(from, to));
    }
    expanded.add(base.replace(/\b([a-z])\s+([a-z])\s+([a-z])\s+([a-z])\b/g, "$1$2$3$4"));
    return Array.from(expanded);
  }

  function fuzzyScore(query, text) {
    if (!query) return 0;
    if (text === query) return 100;
    if (text.startsWith(query)) return 80;
    if (text.includes(query)) return 60;
    let qi = 0;
    for (let i = 0; i < text.length && qi < query.length; i++) {
      if (text[i] === query[qi]) qi++;
    }
    return qi === query.length ? 40 : 0;
  }

  function buildSuggestions(rawQuery) {
    const queries = expandQueryWithSynonyms(rawQuery);
    if (!queries.length) return [];

    const dedupe = new Map();
    for (const s of stationOptions) {
      const key = `${s.stop_id}`;
      if (!dedupe.has(key)) dedupe.set(key, s);
    }

    return Array.from(dedupe.values())
      .map((s) => {
        const label = `${s.stop_name} (${s.route_id})`;
        const name = normText(s.stop_name);
        const normalizedLabel = normText(label);
        let score = 0;
        for (const query of queries) {
          score = Math.max(score, fuzzyScore(query, name), fuzzyScore(query, normalizedLabel));
        }
        return { ...s, label, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
  }

  function renderSuggestions(list) {
    suggestions.innerHTML = "";
    if (!list.length) {
      suggestions.style.display = "none";
      searchInput.setAttribute("aria-expanded", "false");
      return;
    }
    suggestions.style.display = "block";
    searchInput.setAttribute("aria-expanded", "true");
    list.forEach((item) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "suggestion-item";
      btn.setAttribute("role", "option");
      btn.textContent = item.label;
      btn.onclick = () => {
        searchInput.value = "";
        suggestions.style.display = "none";
        searchInput.setAttribute("aria-expanded", "false");
        onSearchSelect(String(item.stop_id));
      };
      suggestions.appendChild(btn);
    });
  }

  searchInput.oninput = () => {
    renderSuggestions(buildSuggestions(searchInput.value));
  };
  searchInput.onfocus = () => {
    renderSuggestions(buildSuggestions(searchInput.value));
  };
  searchInput.onblur = () => {
    setTimeout(() => {
      suggestions.style.display = "none";
      searchInput.setAttribute("aria-expanded", "false");
    }, 120);
  };
  searchInput.onkeydown = (evt) => {
    if (evt.key === "Enter") {
      const top = buildSuggestions(searchInput.value)[0];
      if (top) {
        onSearchSelect(String(top.stop_id));
        suggestions.style.display = "none";
        searchInput.setAttribute("aria-expanded", "false");
      }
    }
  };

  if (typeof window !== "undefined") {
    window.addEventListener("jronda:hide-floating-panels", () => {
      hideRoutePanel();
    });
    const showPanelOnActivity = () => showRoutePanel();
    ["pointerdown", "keydown", "touchstart"].forEach((eventName) => {
      window.addEventListener(eventName, showPanelOnActivity, { passive: true });
    });
  }

  function buildRouteStepList(route) {
    const wrapper = document.createElement("div");
    if (!route || !Array.isArray(route.stations) || !route.stations.length) {
      wrapper.textContent = t("no_route_detail", "No route detail.");
      return wrapper;
    }

    function toPositiveNumber(value) {
      const n = Number(value);
      return Number.isFinite(n) && n > 0 ? n : null;
    }

    function estimateWalkMinutesBetweenStops(fromStop, toStop) {
      const lat1 = Number(fromStop?.stop_lat);
      const lon1 = Number(fromStop?.stop_lon);
      const lat2 = Number(toStop?.stop_lat);
      const lon2 = Number(toStop?.stop_lon);
      if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return 3;
      const toRad = (v) => (v * Math.PI) / 180;
      const earthRadiusMeters = 6371000;
      const dLat = toRad(lat2 - lat1);
      const dLon = toRad(lon2 - lon1);
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) *
          Math.cos(toRad(lat2)) *
          Math.sin(dLon / 2) ** 2;
      const meters = 2 * earthRadiusMeters * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const walkingMetersPerMinute = 78;
      return Math.max(1, Math.round(meters / walkingMetersPerMinute));
    }

    function pad2(value, locale) {
      return new Intl.NumberFormat(locale, {
        minimumIntegerDigits: 2,
        useGrouping: false,
      }).format(value);
    }

    function formatClock(date, locale) {
      return `${pad2(date.getHours(), locale)}:${pad2(date.getMinutes(), locale)}:${pad2(date.getSeconds(), locale)}`;
    }

    const stepList = document.createElement("div");
    stepList.className = "step-list";
    const stationRows = route.stations;
    const lineSummaryRegex = /(seremban line|port klang line)/i;
    let prev = null;
    const locale = (() => {
      const currentLang = window?.jrondaI18n?.getLang?.() || "en";
      const localeByLang = {
        en: "en-MY",
        ms: "ms-MY",
        zh: "zh-CN",
        yue: "yue-HK",
        ta: "ta-MY",
        ar: "ar-MY",
      };
      return localeByLang[currentLang] || "en-MY";
    })();
    const etaMinutes = toPositiveNumber(route.ETA ?? route.eta);
    if (etaMinutes != null) {
      const now = new Date();
      const arrival = new Date(now.getTime() + etaMinutes * 60 * 1000);
      const timeMeta = document.createElement("div");
      timeMeta.className = "route-option-meta";
      timeMeta.textContent =
        `${t("now", "Now")} ${formatClock(now, locale)} | ${t("eta", "ETA")} ${etaMinutes} min | ${t("arrival", "Arrival")} ${formatClock(arrival, locale)}`;
      wrapper.appendChild(timeMeta);
    }

    for (let idx = 0; idx < stationRows.length; idx++) {
      const station = stationRows[idx];
      const current = station || {};
      const mode = String(current.mode || "");
      const lineName = current.route_public_name || current.route_long_name || current.route_id || "";

      if (prev && String(prev.route_id) !== String(current.route_id)) {
        const transferToLineName = current.route_public_name || current.route_long_name || current.route_id || "route";
        const transferToStationName = current.stop_name || "next station";
        const transferWalkMinutes = estimateWalkMinutesBetweenStops(prev, current);
        const walkRow = document.createElement("div");
        walkRow.className = "step-row";
        walkRow.innerHTML = `
          <div class="step-left">
            <img class="mode-icon" src="/src/img/Connecting_icon.svg" alt="${t("walk", "Walk")}" style="margin-top:1px;margin-right:0;"/>
            <div class="step-line walk"></div>
          </div>
          <div class="step-text"><b>${t("walk", "Walk")}</b> to (${transferToLineName} ${transferToStationName}) (~${transferWalkMinutes} min)</div>
        `;
        stepList.appendChild(walkRow);
      }

      if (
        mode === "RAIL" &&
        lineSummaryRegex.test(String(lineName)) &&
        (idx === 0 || String(stationRows[idx - 1]?.route_long_name || "") !== String(current.route_long_name || ""))
      ) {
        const blockStations = [];
        let cursor = idx;
        while (cursor < stationRows.length) {
          const cs = stationRows[cursor] || {};
          const csLine = cs.route_public_name || cs.route_long_name || cs.route_id || "";
          if (String(cs.route_id || "") !== String(current.route_id || "")) break;
          if (!lineSummaryRegex.test(String(csLine))) break;
          blockStations.push(cs);
          cursor++;
        }
        if (blockStations.length >= 3) {
          const routeColor = getRouteColor(
            String(current.route_id || ""),
            false,
            current.route_color ?? null
          ).color;
          const summaryWrap = document.createElement("div");
          summaryWrap.className = "step-summary";
          summaryWrap.style.color = routeColor;
          const uniqueStops = [];
          const seenStop = new Set();
          for (const st of blockStations) {
            const name = String(st.stop_name || "");
            if (!name || seenStop.has(name)) continue;
            seenStop.add(name);
            uniqueStops.push(name);
          }
          summaryWrap.innerHTML = `
            <div class="summary-title">${lineName} ${t("summary", "summary")} (${uniqueStops.length} ${t("stops", "stops")})</div>
            <div class="summary-list">
              ${uniqueStops
                .map((name) => `<div class="summary-stop"><span class="dot"></span><span>${name}</span></div>`)
                .join("")}
            </div>
          `;
          stepList.appendChild(summaryWrap);
          prev = blockStations[blockStations.length - 1];
          idx = cursor - 1;
          continue;
        }
      }

      const icon = getModeIcon(mode, current.category);
      const routeColor = getRouteColor(
        String(current.route_id || ""),
        false,
        current.route_color ?? null
      ).color;
      const row = document.createElement("div");
      row.className = "step-row";
      row.innerHTML = `
        <div class="step-left">
          <div class="step-node" style="border-color:${routeColor};"></div>
          ${idx < route.stations.length - 1 ? `<div class="step-line" style="background:${routeColor};"></div>` : ""}
        </div>
        <div class="step-text"><img class="mode-icon" src="${icon}" alt="${mode || t("mode_label", "mode")}"/><b>${current.stop_name || current.stop_id || t("route", "Route")}</b> - ${lineName}</div>
      `;
      stepList.appendChild(row);
      prev = current;
    }

    wrapper.appendChild(stepList);
    return wrapper;
  }

  function updatePanel(routes, selectedIndex = 0, onSelect) {
    showRoutePanel();
    const c = content;
    c.innerHTML = "";

    if (!routes || !routes.length) {
      c.textContent = t("no_route_found", "No route found.");
      return;
    }

    routes.forEach((route, i) => {
      const routeDiv = document.createElement("div");
      routeDiv.setAttribute("role", "button");
      routeDiv.tabIndex = 0;
      routeDiv.className = `route-option-card${i === selectedIndex ? " is-selected" : ""}`;
      routeDiv.onclick = () => onSelect?.(i);
      routeDiv.onkeydown = (evt) => {
        if (evt.key === "Enter" || evt.key === " ") {
          evt.preventDefault();
          onSelect?.(i);
        }
      };
      const routeTitle = document.createElement("div");
      routeTitle.className = "route-option-title";
      const firstMode = Array.isArray(route.segments) && route.segments.length
        ? String(route.segments[0].mode || "")
        : "";
      const firstCategory = Array.isArray(route.segments) && route.segments.length
        ? String(route.segments[0].category || "")
        : "";
      const firstModeIcon = getModeIcon(firstMode, firstCategory);
      routeTitle.innerHTML = `<img class="mode-icon" src="${firstModeIcon}" alt="${firstMode || t("mode_label", "mode")}"/>${t("option", "Option")} ${i + 1}`;
      routeDiv.appendChild(routeTitle);

      const distanceValue = route.totalDistance ?? route.distance ?? 0;
      const etaValue = route.ETA ?? route.eta ?? 0;
      const transfersValue = route.transfers ?? 0;
      const alternativesValue = route.alternativeCount ?? 0;

      const summary = document.createElement("div");
      summary.textContent = `${t("distance", "Distance")} ${formatDistance(distanceValue)} | ${t("eta", "ETA")} ${formatEtaMinutes(etaValue)} | ${t("transfers", "Transfers")} ${transfersValue}`;
      summary.className = "route-option-meta";
      routeDiv.appendChild(summary);

      if (alternativesValue > 0) {
        const alternativesMeta = document.createElement("div");
        alternativesMeta.className = "route-option-meta";
        alternativesMeta.textContent = `${t("shared_corridor_alternatives", "Shared-corridor alternatives")}: ${alternativesValue}`;
        routeDiv.appendChild(alternativesMeta);
      }

      const modeSummary = document.createElement("div");
      modeSummary.textContent = `${t("modes", "Modes")}: ${route.modeSummary || "N/A"}`;
      modeSummary.className = "route-option-meta route-option-meta-spaced";
      routeDiv.appendChild(modeSummary);

      const chipsWrap = document.createElement("div");
      chipsWrap.className = "route-segment-chip-list";
      const segments = Array.isArray(route.segments) ? route.segments : [];
      for (const segment of segments) {
        const chip = document.createElement("span");
        chip.className = "route-segment-chip";
        const icon = getModeIcon(segment.mode, segment.category);
        chip.innerHTML = `<img class="mode-icon" src="${icon}" alt="${segment.mode || t("mode_label", "mode")}"/>${segment.label || segment.routeId}`;
        const chipColor = segment.color || "#607080";
        chip.style.background = chipColor;
        chip.style.color = getAccessibleTextColor(chipColor);
        if (Array.isArray(segment.alternativeRouteIds) && segment.alternativeRouteIds.length) {
          chip.title = `${t("shared_corridor_alternatives", "Shared-corridor alternatives")}: ${segment.alternativeRouteIds.join(", ")}`;
        }
        chipsWrap.appendChild(chip);
      }
      routeDiv.appendChild(chipsWrap);

      const actions = document.createElement("div");
      actions.className = "route-actions";
      const detailsBtn = document.createElement("button");
      detailsBtn.type = "button";
      detailsBtn.className = "sr-btn";
      detailsBtn.textContent = t("view_steps", "View Steps");
      detailsBtn.onclick = (evt) => {
        evt.stopPropagation();
        const detailNode = buildRouteStepList(route);
        openRouteDetail(`${t("option", "Option")} ${i + 1} ${t("details", "Details")}`, detailNode);
      };
      actions.appendChild(detailsBtn);
      if (i === selectedIndex) {
        const selectedTag = document.createElement("span");
        selectedTag.className = "route-option-meta route-option-selected";
        selectedTag.textContent = t("selected", "Selected");
        actions.appendChild(selectedTag);
      }
      routeDiv.appendChild(actions);

      c.appendChild(routeDiv);
    });
  }

  function setStationInfo(text) {
    stationInfo.textContent = text || t("tap_station_info", "Tap a station to view details");
  }

  function setRailRouteOptions(options = []) {
    routeSelect.innerHTML = "";
    const all = document.createElement("option");
    all.value = "";
    all.textContent = t("all_rail_routes", "All rail routes");
    routeSelect.appendChild(all);
    for (const item of options) {
      const opt = document.createElement("option");
      opt.value = String(item.routeId || "");
      opt.textContent = String(item.label || item.routeId || "");
      routeSelect.appendChild(opt);
    }
    routeSelect.disabled = options.length === 0;
    routeSelect.value = "";
  }

  function setLegendItems(items = []) {
    legendList.innerHTML = "";
    legendButtons.clear();
    for (const item of items) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "legend-item";
      btn.dataset.routeId = String(item.routeId || "");
      btn.innerHTML = `
        <span class="legend-swatch" style="background:${item.color || "#64748b"}"></span>
        <span>${String(item.label || item.routeId || "")}</span>
      `;
      btn.onclick = () => onLegendRouteSelect(String(item.routeId || ""));
      legendButtons.set(String(item.routeId || ""), btn);
      legendList.appendChild(btn);
    }
  }

  function setLegendActiveRoute(routeId = null) {
    const active = routeId ? String(routeId) : "";
    for (const [id, btn] of legendButtons.entries()) {
      btn.classList.toggle("active", id === active);
    }
  }

  function getModeIcon(mode, category = "") {
    const m = String(mode || "").toUpperCase();
    const c = String(category || "").toUpperCase();
    if (m === "RAIL") {
      return c === "KTM" ? "/src/img/train-panthograph.svg" : "/src/img/train-noPanthograph.svg";
    }
    return "/src/img/bus.svg";
  }

  function getAccessibleTextColor(colorHex) {
    const hex = String(colorHex || "").replace("#", "").trim();
    if (!/^[0-9a-fA-F]{6}$/.test(hex)) return "#ffffff";
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return luminance > 0.6 ? "#10253a" : "#ffffff";
  }

  function resetUI() {
    searchInput.value = "";
    suggestions.style.display = "none";
    routeSelect.value = "";
    routeSelect.disabled = true;
    includeBus = true;
    busBtn.textContent = t("on_label", "ON");
    busBtn.classList.add("primary");
    setActivePreset("SMART");
    setStationInfo("");
    content.innerHTML = "";
    content.textContent = t("no_route_selected", "No route selected.");
    applyI18n();
  }

  applyI18n();

  function showToast(message, type = "info", timeoutMs = 2600) {
    if (!message) return;
    const t = document.createElement("div");
    t.className = `jronda-toast ${type}`;
    t.textContent = String(message);
    toastRoot.appendChild(t);
    window.setTimeout(() => {
      t.remove();
    }, timeoutMs);
  }

  return {
    updatePanel,
    setStationInfo,
    setRailRouteOptions,
    resetUI,
    showToast,
    setLegendItems,
    setLegendActiveRoute,
  };
}
    function formatDistance(distanceMeters) {
      const d = Number(distanceMeters);
      if (!Number.isFinite(d) || d <= 0) return "0 m";
      if (d < 1000) return `${Math.round(d)} m`;
      if (d < 100000) return `${(d / 1000).toFixed(1)} km`;
      return `${Math.round(d / 1000)} km`;
    }

    function formatEtaMinutes(totalMinutesRaw) {
      const totalMinutes = Math.max(0, Number(totalMinutesRaw) || 0);
      if (totalMinutes < 60) return `${Math.round(totalMinutes)} min`;
      const hours = Math.floor(totalMinutes / 60);
      const mins = Math.round(totalMinutes % 60);
      return mins ? `${hours} h ${mins} min` : `${hours} h`;
    }
