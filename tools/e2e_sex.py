# 端對端：python tools/e2e_sex.py <截圖資料夾>（需先開 http://127.0.0.1:8888；SEX_BASE 可測線上版）
# 用 Chrome 的假攝影機（不會拍到真人）；假畫面裡沒有人，所以「數次數」用＋1 與節拍模式驗證，判定邏輯由 tools/test_engine.mjs 測。
import sys, io, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', line_buffering=True)
from playwright.sync_api import sync_playwright
OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
BASE = os.environ.get('SEX_BASE', 'http://127.0.0.1:8888/')
errs, fails = [], []

def check(c, msg):
    print(('ok   ' if c else 'FAIL ') + msg)
    if not c: fails.append(msg)

def stub(pg, tag):
    pg.route('**/script.google.com/**', lambda r: r.fulfill(status=200, body='{"marquee":["測試公告：跑馬燈正常"]}', headers={'content-type': 'application/json'}))
    pg.route('**/visitor-badge.laobi.icu/**', lambda r: r.fulfill(status=200, body='', headers={'content-type': 'image/svg+xml'}))
    pg.on('pageerror', lambda e: errs.append(tag + ': ' + str(e)))
    pg.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errs.append(tag + ': ' + m.text))

def skip_intro(pg):
    pg.evaluate("(() => { const R = _sex.R; if (R) R.until = performance.now(); })()")
    pg.wait_for_timeout(250)

with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'])
    ctx = b.new_context(viewport={'width': 1280, 'height': 860}, permissions=['camera'])
    t = ctx.new_page(); stub(t, 'D')
    t.goto(BASE, wait_until='domcontentloaded'); t.wait_for_timeout(800)
    check(t.is_visible('#modal.show') and '不是醫療' in t.inner_text('#modalBox'), '首訪警語（不是醫療工具）')
    t.click('#modal .big'); t.screenshot(path=os.path.join(OUT, '01_home.png'), full_page=True)
    check('今天來動一動' in t.inner_text('#app') and '全身暖身' in t.inner_text('#app'), '首頁顯示今天的課程')
    # 我的課程：只留拍拍手 5 次＋聳聳肩 5 次
    t.click('[data-act=pick]'); t.click('[data-course=custom]'); t.wait_for_timeout(200)
    for cb in t.locator('[data-cus]').all():
        if cb.is_checked(): cb.uncheck()
    ids = t.evaluate('_sex.E.MOVES.map(m => m.id)')
    clap, shrug = ids.index('clap'), ids.index('shrug')
    t.select_option('[data-cusn="%d"]' % clap, '5'); t.check('[data-cus="%d"]' % clap)
    t.select_option('[data-cusn="%d"]' % shrug, '5'); t.check('[data-cus="%d"]' % shrug)
    t.screenshot(path=os.path.join(OUT, '02_custom.png'), full_page=True)
    t.locator('button.big', has_text='好，就這個').click(); t.wait_for_timeout(200)
    check('我的課程' in t.inner_text('#app') and '拍拍手、聳聳肩' in t.inner_text('#app'), '自訂課程：拍拍手、聳聳肩')
    # 節拍模式完整跑一輪
    t.click('[data-act=ready]'); t.wait_for_timeout(300); t.click('[data-mode=beat]'); t.wait_for_timeout(200)
    t.click('[data-act=go]'); t.wait_for_timeout(400)
    check(t.is_visible('.overlay') and '拍拍手' in t.inner_text('.overlay'), '動作開始前的說明畫面')
    t.screenshot(path=os.path.join(OUT, '03_intro.png'))
    skip_intro(t); t.wait_for_timeout(1700)
    check(t.evaluate('_sex.R.count') >= 1, '節拍模式自動數 %s' % t.evaluate('_sex.R.count'))
    t.screenshot(path=os.path.join(OUT, '04_beat.png'))
    t.wait_for_timeout(7000)
    check(t.evaluate('_sex.R && _sex.R.phase') == 'rest', '做滿 5 次進入休息')
    check('下一個' in t.inner_text('.overlay'), '休息畫面顯示下一個動作')
    t.click('[data-act=restSkip]'); t.wait_for_timeout(300); skip_intro(t)
    # 暫停
    t.click('.ctl [data-act=pause]'); t.wait_for_timeout(200); c0 = t.evaluate('_sex.R.count'); t.wait_for_timeout(3500)
    check(t.evaluate('_sex.R.count') == c0 and t.is_visible('text=暫停中'), '暫停時不會繼續數')
    t.click('.overlay [data-act=pause]'); t.wait_for_timeout(200)
    for i in range(6):
        t.evaluate("_sex.ACT.plus()"); t.wait_for_timeout(120)
    t.wait_for_timeout(1200)
    check(t.evaluate('_sex.V.scr') == 'done', '全部做完到完成畫面')
    check('今日' in t.inner_text('#app') and '你好棒' in t.inner_text('#app'), '完成蓋章')
    log = t.evaluate("JSON.parse(localStorage.getItem('sex.log'))")
    check(log and len(log) == 1 and list(log.values())[0]['reps'] >= 10, '紀錄寫入 %s' % log)
    t.screenshot(path=os.path.join(OUT, '05_done.png'), full_page=True)
    t.locator('button.big', has_text='看我的紀錄').click(); t.wait_for_timeout(200)
    check(t.locator('.cal div.on').count() == 1, '月曆蓋了一天')
    # 鏡頭模式（假攝影機）
    t.click('[data-act=home]'); t.click('[data-act=ready]'); t.click('[data-mode=cam]')
    try:
        t.wait_for_function('_sex.V.camReady', timeout=20000); check(True, '假攝影機開啟')
    except Exception:
        check(False, '假攝影機開啟：' + t.inner_text('#app')[:200])
    try:
        t.wait_for_function("document.getElementById('checks') && document.getElementById('checks').textContent.length > 0", timeout=60000)
        check(True, '辨識元件載入並開始檢查（下載自 MediaPipe CDN）')
    except Exception:
        check(False, '辨識元件沒有載入')
    check('還沒看到人' in t.inner_text('#checks'), '假畫面沒有人 → 提示坐到鏡頭前')
    t.screenshot(path=os.path.join(OUT, '06_camcheck.png'))
    t.click('[data-act=go]'); t.wait_for_timeout(300); skip_intro(t); t.wait_for_timeout(800)
    check(t.is_visible('#camBox video') and t.is_visible('#cnt'), '運動畫面有鏡頭與計數')
    check('沒看到人' in t.inner_text('#camHint'), '鏡頭提示沒看到人')
    t.evaluate("_sex.ACT.plus()"); t.wait_for_timeout(300)
    check(t.inner_text('#cntNum') == '1', '＋1 補數')
    t.evaluate("(() => { _sex.R.lastRep = performance.now() - 21000; })()"); t.wait_for_timeout(500)
    check(t.is_visible('.stall'), '20 秒沒數到 → 提醒')
    t.screenshot(path=os.path.join(OUT, '07_cam_run.png'))
    t.click('[data-act=toBeat]'); t.wait_for_timeout(400)
    check(t.evaluate('_sex.R.mode') == 'beat' and t.evaluate('!document.querySelector("#camBox")'), '改跟節拍 → 關鏡頭')
    t.click('.ctl [data-act=quit]'); t.wait_for_timeout(400)
    check(t.evaluate('_sex.V.scr') == 'done', '中途結束：有做的部分有記錄')
    # 鏡頭看不清楚（假畫面沒有人）超過 4 秒 → 這個動作自動改跟節拍數
    t.click('[data-act=home]'); t.click('[data-act=ready]'); t.click('[data-mode=cam]')
    t.wait_for_function('_sex.V.camReady', timeout=20000); t.wait_for_function("document.getElementById('checks') && document.getElementById('checks').textContent.length > 0", timeout=60000)
    t.click('[data-act=go]'); t.wait_for_timeout(300); skip_intro(t); t.wait_for_timeout(5200)
    check(t.evaluate('_sex.R.moveBeat') and '改成跟著' in t.inner_text('#camBox'), '看不清楚 4 秒 → 這個動作改跟節拍（鏡頭仍開著）')
    c1 = t.evaluate('_sex.R.count'); t.wait_for_timeout(3300)
    check(t.evaluate('_sex.R.count') > c1, '改跟節拍後繼續數 %d → %d' % (c1, t.evaluate('_sex.R.count')))
    t.screenshot(path=os.path.join(OUT, '07b_autobeat.png'))
    t.click('.ctl [data-act=quit]'); t.wait_for_timeout(400)
    # 設定
    t.click('[data-act=home]'); t.click('[data-act=settings]'); t.locator('.set-sec summary', has_text='字的大小').click(); t.click('[data-set=fs][data-v=xl]'); t.wait_for_timeout(200)
    check(t.evaluate('document.documentElement.dataset.fs') == 'xl', '特大字')
    t.keyboard.press('Escape')
    m = ctx.new_page(); stub(m, 'M'); m.set_viewport_size({'width': 375, 'height': 760})
    m.goto(BASE, wait_until='domcontentloaded'); m.wait_for_timeout(500)
    check(m.evaluate('document.documentElement.scrollWidth <= innerWidth'), '375px 無橫向捲動（特大字）')
    m.screenshot(path=os.path.join(OUT, '08_mobile.png'), full_page=True)
    print('console 錯誤：', errs[:6]); check(not errs, '沒有 console 錯誤')
    b.close()
print('\n失敗 %d 項' % len(fails) + ('：' + '；'.join(fails) if fails else ''))
sys.exit(1 if fails else 0)
