/* 배경 파티클 — 작은 삼각형 수천 개가 뇌·얼굴·별자리·회사 로고 등으로 모였다 흩어진다.
   window.Particles 로 조작한다: show/showFor/burst/setPulse/setMode/setExport/setCaption/renderOne.
   화면(index.html)과 분리해 두어 다른 페이지에서도 그대로 쓸 수 있다. */
(function particleField() {
  const cv = document.getElementById("bgCanvas");
  if (!cv) return;
  const ctx = cv.getContext("2d", { alpha: false });
  // 레퍼런스처럼 윤곽은 따뜻한 금빛, 내부는 흰빛·보라 계열로 나눈다
  const WARM = ["#ffb829", "#ffd166", "#ff9f45", "#ffe9a8"];
  const COOL = ["#ffffff", "#e8e2ff", "#b388ff", "#8052ff", "#5b8dff",
                "#42d6c3", "#15846e", "#e05cff"];
  const COLORS = WARM.concat(COOL);
  const WARM_N = WARM.length;
  // 입자 수는 성능을 위해 고정하고, 화면이 클수록 '크기'를 키워 사이가 벌어지지 않게 한다
  const N = 10400;
  let W = 0, H = 0, DPR = 1, SIZE_SCALE = 1;

  // 색상별 삼각형 스프라이트를 미리 그려두고 재사용 (수천 개 그려도 빠름)
  const sprites = COLORS.map(c => {
    // 확대돼도 또렷하되 과하지 않은 크기 (그리기 비용 절약)
    const s = 8, off = document.createElement("canvas");
    off.width = off.height = s * 2;
    const o = off.getContext("2d");
    o.strokeStyle = c; o.lineWidth = 1.9;
    o.shadowColor = c; o.shadowBlur = 3;             // 은은한 발광으로 색이 살아나게
    o.beginPath();
    o.moveTo(s, s - 5.2); o.lineTo(s + 4.8, s + 3.6); o.lineTo(s - 4.8, s + 3.6);
    o.closePath(); o.stroke();
    return off;
  });

  let EXPORT = null;                 // 영상 내보내기용 고정 해상도 {w,h}
  function resize() {
    if (EXPORT) {                    // 화면 크기와 무관하게 정확히 그 해상도로 그린다
      DPR = 1; W = EXPORT.w; H = EXPORT.h;
      cv.width = W; cv.height = H;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      SIZE_SCALE = Math.max(1.0, Math.min(2.6, Math.min(W, H) / 680));
      return;
    }
    // 아주 큰 화면에서는 내부 해상도를 낮춰 그리기 비용을 줄인다 (시각 차이 거의 없음)
    DPR = Math.min(window.innerWidth * window.innerHeight > 2600000 ? 1 : 1.5,
                   window.devicePixelRatio || 1);
    W = cv.clientWidth; H = cv.clientHeight;
    cv.width = Math.floor(W * DPR); cv.height = Math.floor(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    // 기준 900px 대비 화면이 커진 만큼 입자를 키운다 (개수는 그대로 → 성능 유지)
    SIZE_SCALE = Math.max(1.0, Math.min(2.6, Math.min(W, H) / 680));
  }
  window.addEventListener("resize", resize);
  resize();

  const rnd = (a, b) => a + Math.random() * (b - a);

  /* --- 실루엣을 그린 뒤 그 안의 점을 뽑아 형상을 만든다 (알아볼 수 있는 모양) --- */
  const S = 360;                                    // 실루엣 렌더 캔버스 (해상도 ↑ = 디테일 ↑)
  function samplePoints(drawFn, count) {
    const off = document.createElement("canvas");
    off.width = off.height = S;
    const o = off.getContext("2d");
    o.fillStyle = "#fff";
    drawFn(o, S);
    const data = o.getImageData(0, 0, S, S).data;
    const solid = new Uint8Array(S * S);
    for (let i = 0, n = S * S; i < n; i++) solid[i] = data[i * 4 + 3] > 128 ? 1 : 0;

    // 경계로부터의 거리(distance transform) — 이 값으로 실루엣을 3D로 부풀린다
    const INF = 1e6;
    const dist = new Float32Array(S * S);
    for (let i = 0, n = S * S; i < n; i++) dist[i] = solid[i] ? INF : 0;
    for (let y = 1; y < S; y++) {                    // 전방 패스
      for (let x = 1; x < S - 1; x++) {
        const i = y * S + x;
        if (!dist[i]) continue;
        const m = Math.min(dist[i], dist[i - 1] + 1, dist[i - S] + 1,
                           dist[i - S - 1] + 1.414, dist[i - S + 1] + 1.414);
        dist[i] = m;
      }
    }
    for (let y = S - 2; y >= 0; y--) {               // 후방 패스
      for (let x = S - 2; x > 0; x--) {
        const i = y * S + x;
        if (!dist[i]) continue;
        const m = Math.min(dist[i], dist[i + 1] + 1, dist[i + S] + 1,
                           dist[i + S + 1] + 1.414, dist[i + S - 1] + 1.414);
        dist[i] = m;
      }
    }
    let maxD = 1;
    const cells = [];
    for (let i = 0, n = S * S; i < n; i++) {
      if (dist[i] > 0 && dist[i] < INF) { cells.push(i); if (dist[i] > maxD) maxD = dist[i]; }
    }
    const pts = [];
    if (!cells.length) return pts;

    // 내부를 빈틈없이 채운다: 70%는 전체 면적에 균일 분포, 30%는 윤곽에 추가 배치
    const DEPTH = 0.8;
    const edgeCells = cells.filter(i => dist[i] / maxD < 0.14);
    const nUniform = Math.round(count * 0.70);
    const place = (pool, k, edgeFlag) => {
      if (!pool.length) return;
      for (let j = 0; j < k; j++) {
        const idx = pool[(Math.random() * pool.length) | 0];
        const d = dist[idx] / maxD;                  // 0(가장자리) ~ 1(중심)
        const x = (idx % S) + rnd(-0.85, 0.85);
        const y = ((idx / S) | 0) + rnd(-0.85, 0.85);
        // 부피: 중심일수록 두껍고, 두께 안쪽까지 균일하게 채워 속이 비지 않게
        const zMag = DEPTH * Math.sqrt(d);
        const z = (Math.random() * 2 - 1) * zMag;
        pts.push([(x / S - 0.5) * 2.0, (y / S - 0.5) * 2.0, z,
                  edgeFlag || d < 0.12 ? 1 : 0]);
      }
    };
    place(cells, nUniform, 0);                       // 전체 면적 균일 → 중앙까지 꽉 참
    place(edgeCells.length ? edgeCells : cells, count - nUniform, 1);   // 윤곽 강조
    // 순서를 섞어 색이 고르게 분포되도록
    for (let i = pts.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const t = pts[i]; pts[i] = pts[j]; pts[j] = t;
    }
    return pts;
  }

  /* 실루엣 정의 (0~S 좌표계) */
  function drawBrain(o, s) {                        // 뇌 옆모습 — 주름진 대뇌 + 소뇌 + 뇌간
    const u = s / 100, P = (x, y) => [x * u, y * u];
    // 대뇌: 참고 이미지처럼 크고 둥근 덩어리 (3/4 시점)
    o.beginPath(); o.ellipse(...P(50, 45), 40 * u, 33 * u, -0.06, 0, 7); o.fill();
    // 윤곽을 울퉁불퉁한 이랑(gyrus)으로 — 원 둘레에 혹을 붙인다
    for (let a = 0; a < 26; a++) {
      const th = (a / 26) * Math.PI * 2;
      const rr = 1 + 0.045 * Math.sin(a * 2.7) + 0.03 * Math.cos(a * 1.6);
      const bx = 50 + 40 * rr * Math.cos(th) * 0.97;
      const by = 45 + 33 * rr * Math.sin(th) * 0.97;
      o.beginPath(); o.arc(...P(bx, by), (4.6 + 1.6 * Math.sin(a * 2.1)) * u, 0, 7); o.fill();
    }
    // 소뇌: 오른쪽 아래 별도 덩어리
    o.beginPath(); o.ellipse(...P(68, 76), 18 * u, 11 * u, 0.18, 0, 7); o.fill();
    for (let a = 0; a < 8; a++) {
      o.beginPath();
      o.arc(...P(54 + a * 4.2, 78 + 2.4 * Math.sin(a)), 4.4 * u, 0, 7); o.fill();
    }
    // 뇌간
    o.beginPath();
    o.moveTo(...P(46, 72)); o.lineTo(...P(58, 74));
    o.bezierCurveTo(...P(58, 86), ...P(54, 94), ...P(48, 95));
    o.bezierCurveTo(...P(43, 92), ...P(44, 82), ...P(46, 72));
    o.closePath(); o.fill();

    // 뇌구(sulcus): 실루엣 안쪽을 얇게 파내 주름을 만든다
    o.globalCompositeOperation = "destination-out";
    o.strokeStyle = "#000"; o.lineCap = "round"; o.lineWidth = 2.6 * u;
    const sulci = [
      [[16, 44], [28, 36], [40, 41], [52, 33], [64, 38], [76, 31], [86, 37]],
      [[14, 54], [26, 47], [38, 53], [50, 45], [62, 51], [74, 44], [86, 49]],
      [[18, 64], [30, 58], [42, 64], [54, 57], [66, 62], [78, 56]],
      [[22, 30], [32, 24], [44, 29], [56, 22], [68, 27], [78, 22]],
      [[26, 20], [38, 16], [50, 20], [62, 15], [72, 19]],
      [[20, 38], [24, 48], [21, 58]],
      [[80, 28], [86, 40], [82, 52]],
      [[34, 68], [46, 71], [58, 68]],
    ];
    sulci.forEach(pts => {
      o.beginPath();
      o.moveTo(...P(pts[0][0], pts[0][1]));
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
        o.quadraticCurveTo(...P(pts[i][0], pts[i][1]), ...P(mx, my));
      }
      o.stroke();
    });
    // 좌우 반구를 가르는 세로 홈
    o.lineWidth = 2.2 * u;
    o.beginPath();
    o.moveTo(...P(53, 15));
    o.bezierCurveTo(...P(50, 32), ...P(56, 48), ...P(53, 70));
    o.stroke();
    // 소뇌 주름
    o.lineWidth = 1.6 * u;
    [70, 74, 78].forEach(y => {
      o.beginPath(); o.moveTo(...P(64, y)); o.lineTo(...P(85, y - 2)); o.stroke();
    });
    o.globalCompositeOperation = "source-over";
  }
  function drawFace(o, s) {                         // 사람 얼굴 (정면)
    const u = s / 100, P = (x, y) => [x * u, y * u];
    o.beginPath();                                   // 머리 + 턱
    o.moveTo(...P(50, 12));
    o.bezierCurveTo(...P(74, 12), ...P(80, 32), ...P(78, 48));
    o.bezierCurveTo(...P(77, 68), ...P(64, 86), ...P(50, 88));
    o.bezierCurveTo(...P(36, 86), ...P(23, 68), ...P(22, 48));
    o.bezierCurveTo(...P(20, 32), ...P(26, 12), ...P(50, 12));
    o.closePath(); o.fill();
    o.beginPath(); o.ellipse(...P(28, 50), 6 * u, 9 * u, 0, 0, 7); o.fill();  // 귀
    o.beginPath(); o.ellipse(...P(72, 50), 6 * u, 9 * u, 0, 0, 7); o.fill();
    o.beginPath();                                   // 머리카락
    o.moveTo(...P(22, 40));
    o.bezierCurveTo(...P(24, 14), ...P(76, 14), ...P(78, 40));
    o.bezierCurveTo(...P(72, 26), ...P(28, 26), ...P(22, 40));
    o.closePath(); o.fill();
    o.globalCompositeOperation = "destination-out";  // 눈·입을 비워 얼굴로 인식되게
    o.beginPath(); o.ellipse(...P(39, 48), 5 * u, 3 * u, 0, 0, 7); o.fill();
    o.beginPath(); o.ellipse(...P(61, 48), 5 * u, 3 * u, 0, 0, 7); o.fill();
    o.lineWidth = 3 * u; o.strokeStyle = "#000"; o.lineCap = "round";
    o.beginPath(); o.moveTo(...P(42, 68));
    o.quadraticCurveTo(...P(50, 74), ...P(58, 68)); o.stroke();
    o.globalCompositeOperation = "source-over";
  }
  function drawDog(o, s) {                          // 강아지 얼굴
    const u = s / 100, P = (x, y) => [x * u, y * u];
    o.beginPath(); o.ellipse(...P(50, 50), 30 * u, 27 * u, 0, 0, 7); o.fill();  // 머리
    o.beginPath(); o.ellipse(...P(21, 52), 11 * u, 22 * u, 0.25, 0, 7); o.fill(); // 귀
    o.beginPath(); o.ellipse(...P(79, 52), 11 * u, 22 * u, -0.25, 0, 7); o.fill();
    o.beginPath(); o.ellipse(...P(50, 68), 17 * u, 13 * u, 0, 0, 7); o.fill();  // 주둥이
    o.globalCompositeOperation = "destination-out";
    o.beginPath(); o.ellipse(...P(39, 44), 4.2 * u, 5 * u, 0, 0, 7); o.fill();  // 눈
    o.beginPath(); o.ellipse(...P(61, 44), 4.2 * u, 5 * u, 0, 0, 7); o.fill();
    o.beginPath(); o.ellipse(...P(50, 62), 5 * u, 4 * u, 0, 0, 7); o.fill();    // 코
    o.lineWidth = 2.6 * u; o.strokeStyle = "#000"; o.lineCap = "round";
    o.beginPath(); o.moveTo(...P(50, 66)); o.lineTo(...P(50, 71));
    o.moveTo(...P(50, 71)); o.quadraticCurveTo(...P(43, 75), ...P(40, 70));
    o.moveTo(...P(50, 71)); o.quadraticCurveTo(...P(57, 75), ...P(60, 70));
    o.stroke();
    o.globalCompositeOperation = "source-over";
  }
  function drawCat(o, s) {                          // 고양이 얼굴
    const u = s / 100, P = (x, y) => [x * u, y * u];
    o.beginPath();                                   // 귀
    o.moveTo(...P(24, 46)); o.lineTo(...P(28, 14)); o.lineTo(...P(50, 30)); o.closePath(); o.fill();
    o.beginPath();
    o.moveTo(...P(76, 46)); o.lineTo(...P(72, 14)); o.lineTo(...P(50, 30)); o.closePath(); o.fill();
    o.beginPath(); o.ellipse(...P(50, 55), 29 * u, 26 * u, 0, 0, 7); o.fill();
    o.globalCompositeOperation = "destination-out";
    o.beginPath(); o.ellipse(...P(38, 50), 4 * u, 6 * u, 0, 0, 7); o.fill();
    o.beginPath(); o.ellipse(...P(62, 50), 4 * u, 6 * u, 0, 0, 7); o.fill();
    o.lineWidth = 2.4 * u; o.strokeStyle = "#000"; o.lineCap = "round";
    o.beginPath();
    o.moveTo(...P(50, 62)); o.lineTo(...P(50, 66));
    o.moveTo(...P(50, 66)); o.quadraticCurveTo(...P(44, 70), ...P(41, 65));
    o.moveTo(...P(50, 66)); o.quadraticCurveTo(...P(56, 70), ...P(59, 65));
    o.moveTo(...P(18, 58)); o.lineTo(...P(34, 61));                    // 수염
    o.moveTo(...P(18, 66)); o.lineTo(...P(34, 66));
    o.moveTo(...P(82, 58)); o.lineTo(...P(66, 61));
    o.moveTo(...P(82, 66)); o.lineTo(...P(66, 66));
    o.stroke();
    o.globalCompositeOperation = "source-over";
  }
  function drawHand(o, s) {                         // 손 (손바닥 + 다섯 손가락)
    const u = s / 100, P = (x, y) => [x * u, y * u];
    o.beginPath();                                   // 손바닥
    o.moveTo(...P(32, 62));
    o.bezierCurveTo(...P(30, 78), ...P(38, 90), ...P(52, 90));
    o.bezierCurveTo(...P(66, 90), ...P(72, 78), ...P(71, 62));
    o.lineTo(...P(32, 62)); o.closePath(); o.fill();
    const fingers = [[37, 60, 34, 30], [46, 58, 45, 20], [55, 58, 56, 20], [64, 60, 66, 32]];
    fingers.forEach(([x0, y0, x1, y1]) => {          // 검지~새끼
      o.beginPath(); o.lineWidth = 9 * u; o.lineCap = "round";
      o.strokeStyle = "#fff";
      o.moveTo(...P(x0, y0)); o.lineTo(...P(x1, y1)); o.stroke();
    });
    o.beginPath(); o.lineWidth = 10 * u; o.lineCap = "round";  // 엄지
    o.moveTo(...P(34, 70)); o.lineTo(...P(18, 56)); o.stroke();
    o.globalCompositeOperation = "destination-out";  // 손금·마디로 디테일
    o.lineWidth = 2.4 * u; o.strokeStyle = "#000";
    o.beginPath();
    o.moveTo(...P(36, 72)); o.quadraticCurveTo(...P(50, 78), ...P(66, 72));
    o.moveTo(...P(38, 80)); o.quadraticCurveTo(...P(52, 84), ...P(64, 79));
    [[34, 42], [45, 34], [56, 34], [66, 44]].forEach(([x, y]) => {
      o.moveTo(...P(x - 4, y)); o.lineTo(...P(x + 4, y));
    });
    o.stroke();
    o.globalCompositeOperation = "source-over";
  }
  function drawEye(o, s) {                          // 눈 (아몬드 + 홍채 + 속눈썹)
    const u = s / 100, P = (x, y) => [x * u, y * u];
    o.beginPath();                                   // 눈 윤곽
    o.moveTo(...P(12, 50));
    o.bezierCurveTo(...P(30, 22), ...P(70, 22), ...P(88, 50));
    o.bezierCurveTo(...P(70, 78), ...P(30, 78), ...P(12, 50));
    o.closePath(); o.fill();                                          // 눈 전체를 꽉 채움
    o.lineWidth = 3 * u; o.strokeStyle = "#fff"; o.lineCap = "round";  // 속눈썹
    [[18, 40, 12, 30], [32, 28, 28, 16], [50, 24, 50, 11], [68, 28, 72, 16], [82, 40, 88, 30]]
      .forEach(([x0, y0, x1, y1]) => {
        o.beginPath(); o.moveTo(...P(x0, y0)); o.lineTo(...P(x1, y1)); o.stroke();
      });
  }
  function drawEarth(o, s) {                        // 지구 — 대륙 실루엣 + 경위선
    const u = s / 100, P = (x, y) => [x * u, y * u];
    o.beginPath(); o.arc(...P(50, 50), 39 * u, 0, 7); o.fill();   // 속이 꽉 찬 구
  }
  function drawSail(o, s) {                         // 돛(세일) + 스톤 — 로고 파일이 없을 때의 대체 형상
    const u = s / 100, P = (x, y) => [x * u, y * u];
    o.beginPath();                                   // 큰 돛
    o.moveTo(...P(52, 12)); o.lineTo(...P(52, 62)); o.lineTo(...P(18, 62));
    o.quadraticCurveTo(...P(34, 36), ...P(52, 12)); o.closePath(); o.fill();
    o.beginPath();                                   // 작은 돛
    o.moveTo(...P(58, 22)); o.lineTo(...P(58, 62)); o.lineTo(...P(84, 62));
    o.quadraticCurveTo(...P(70, 38), ...P(58, 22)); o.closePath(); o.fill();
    o.beginPath();                                   // 선체(스톤)
    o.moveTo(...P(14, 68)); o.lineTo(...P(88, 68));
    o.quadraticCurveTo(...P(70, 86), ...P(46, 86));
    o.quadraticCurveTo(...P(24, 84), ...P(14, 68)); o.closePath(); o.fill();
    o.globalCompositeOperation = "destination-out";
    o.lineWidth = 3 * u; o.strokeStyle = "#000";
    o.beginPath(); o.moveTo(...P(54, 12)); o.lineTo(...P(54, 66)); o.stroke();  // 마스트
    o.globalCompositeOperation = "source-over";
  }
  /* 별자리: 별(원) + 연결선 — 실제 관측 패턴 기준 */
  function constellation(stars, links) {
    return (o, s) => {
      const u = s / 100, P = (x, y) => [x * u, y * u];
      o.lineWidth = 1.8 * u; o.strokeStyle = "#fff"; o.lineCap = "round";
      links.forEach(([a, b]) => {
        o.beginPath();
        o.moveTo(...P(stars[a][0], stars[a][1]));
        o.lineTo(...P(stars[b][0], stars[b][1]));
        o.stroke();
      });
      stars.forEach(st => {                          // 밝기(3번째 값)에 따라 별 크기
        o.beginPath();
        o.arc(...P(st[0], st[1]), (st[2] || 2.2) * u, 0, 7);
        o.fill();
      });
    };
  }
  const drawOrion = constellation(              // 오리온자리
    [[35, 22, 3.4], [58, 20, 3.8], [43, 48, 2.8], [50, 49, 2.8], [57, 50, 2.8],
     [33, 80, 3.6], [60, 76, 3.2], [46, 33, 1.8], [40, 63, 1.8], [54, 64, 1.8]],
    [[0, 7], [7, 1], [0, 2], [1, 4], [2, 3], [3, 4], [2, 8], [8, 5], [4, 9], [9, 6]]);
  const drawDipper = constellation(             // 북두칠성 (큰곰자리)
    [[18, 34, 3.4], [21, 52, 3.0], [39, 55, 2.8], [41, 38, 2.6],
     [56, 32, 3.0], [70, 26, 3.0], [85, 18, 3.4]],
    [[0, 1], [1, 2], [2, 3], [3, 0], [3, 4], [4, 5], [5, 6]]);
  const drawCassiopeia = constellation(         // 카시오페이아 (W)
    [[14, 62, 3.0], [33, 34, 3.4], [50, 58, 2.8], [68, 30, 3.4], [86, 60, 3.0]],
    [[0, 1], [1, 2], [2, 3], [3, 4]]);
  const drawCygnus = constellation(             // 백조자리 (북십자성)
    [[50, 12, 3.8], [50, 40, 3.0], [50, 62, 2.6], [50, 86, 3.0],
     [16, 44, 3.0], [32, 42, 2.4], [68, 42, 2.4], [84, 46, 3.0]],
    [[0, 1], [1, 2], [2, 3], [4, 5], [5, 1], [1, 6], [6, 7]]);
  const drawScorpius = constellation(           // 전갈자리 (J)
    [[18, 18, 3.0], [30, 26, 2.6], [18, 34, 3.0], [40, 34, 2.4],
     [48, 46, 4.0], [54, 60, 2.6], [58, 72, 2.6], [66, 80, 2.6],
     [76, 82, 2.8], [84, 74, 2.6], [80, 64, 3.0]],
    [[0, 1], [1, 2], [1, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 9], [9, 10]]);

  function drawSquare(o, s) {                        // 네모 (속이 꽉 찬 형태)
    const u = s / 100;
    if (o.roundRect) { o.beginPath(); o.roundRect(18 * u, 18 * u, 64 * u, 64 * u, 8 * u); o.fill(); }
    else o.fillRect(18 * u, 18 * u, 64 * u, 64 * u);
  }
  function drawTriangle(o, s) {                      // 세모 (속이 꽉 찬 형태)
    const u = s / 100, P = (x, y) => [x * u, y * u];
    o.beginPath();
    o.moveTo(...P(50, 12)); o.lineTo(...P(88, 82)); o.lineTo(...P(12, 82));
    o.closePath(); o.fill();
  }
  function drawMouse(o, s) {                         // 마우스
    const u = s / 100, P = (x, y) => [x * u, y * u];
    o.beginPath();
    o.moveTo(...P(50, 14));
    o.bezierCurveTo(...P(72, 14), ...P(78, 34), ...P(78, 52));
    o.bezierCurveTo(...P(78, 76), ...P(66, 88), ...P(50, 88));
    o.bezierCurveTo(...P(34, 88), ...P(22, 76), ...P(22, 52));
    o.bezierCurveTo(...P(22, 34), ...P(28, 14), ...P(50, 14));
    o.closePath(); o.fill();
    o.globalCompositeOperation = "destination-out";
    o.lineWidth = 2.6 * u; o.strokeStyle = "#000";
    o.beginPath(); o.moveTo(...P(50, 15)); o.lineTo(...P(50, 40)); o.stroke();  // 버튼 분리선
    o.beginPath(); o.moveTo(...P(24, 41)); o.lineTo(...P(76, 41)); o.stroke();
    o.beginPath(); o.roundRect ? o.roundRect(46 * u, 20 * u, 8 * u, 16 * u, 4 * u)
                               : o.rect(46 * u, 20 * u, 8 * u, 16 * u);
    o.fill();                                                                    // 휠
    o.globalCompositeOperation = "source-over";
  }
  function drawKeyboard(o, s) {                      // 키보드
    const u = s / 100;
    const R = (x, y, w, h, r) => {
      o.beginPath();
      if (o.roundRect) o.roundRect(x * u, y * u, w * u, h * u, (r || 2) * u);
      else o.rect(x * u, y * u, w * u, h * u);
      o.fill();
    };
    R(8, 30, 84, 44, 6);                              // 본체 (꽉 참)
    o.globalCompositeOperation = "destination-out";   // 키 사이 틈만 얇게
    o.lineWidth = 1.4 * u; o.strokeStyle = "#000";
    [38, 48, 58, 68].forEach(y => {
      o.beginPath(); o.moveTo(11 * u, y * u); o.lineTo(89 * u, y * u); o.stroke();
    });
    for (let i = 1; i < 14; i++) {
      o.beginPath(); o.moveTo((11 + i * 5.6) * u, 33 * u);
      o.lineTo((11 + i * 5.6) * u, 64 * u); o.stroke();
    }
    o.globalCompositeOperation = "source-over";
  }

  function drawFilm(o, s) {                         // 필름·재생 아이콘 (앱 정체성)
    const u = s / 100, P = (x, y) => [x * u, y * u];
    o.beginPath(); o.arc(...P(50, 50), 36 * u, 0, 7); o.fill();   // 속이 꽉 찬 원
    o.globalCompositeOperation = "destination-out";              // 재생 삼각형을 파냄
    o.beginPath();
    o.moveTo(...P(40, 32)); o.lineTo(...P(72, 50)); o.lineTo(...P(40, 68));
    o.closePath(); o.fill();
    o.globalCompositeOperation = "source-over";
  }

  const SILHOUETTES = [drawBrain, drawFace, drawHand, drawEye, drawDog, drawCat,
                       drawEarth, drawOrion, drawTriangle, drawDipper, drawMouse,
                       drawCassiopeia, drawSquare, drawCygnus, drawKeyboard,
                       drawScorpius, drawSail, drawFilm];
  const CLOUDS = SILHOUETTES.map(fn => samplePoints(fn, N));

  /* app/shapes/ 폴더에 png/svg를 넣으면 그 실루엣도 자동으로 형상에 추가된다
     (회사 로고처럼 정확한 모양이 필요할 때 사용) */
  let LOGO_CLOUD = null;                              // 세일링스톤 로고 (정지 화면용)
  fetch("/api/shapes").then(r => r.json()).then(list => {
    (list.shapes || []).forEach(name => {
      const img = new Image();
      img.onload = () => {
        const cloud = samplePoints(o => {
          const sc = Math.min(S * 0.88 / img.width, S * 0.88 / img.height);
          const w = img.width * sc, h = img.height * sc;
          o.drawImage(img, (S - w) / 2, (S - h) / 2, w, h);
        }, N);
        if (!cloud.length) return;
        CLOUDS.push(cloud);
        if (/sailing|logo/i.test(name)) {
          LOGO_CLOUD = cloud;
          if (MODE === "still" && !stillDone) showLogoThenFreeze();
        }
      };
      img.src = "/api/shapes/" + encodeURIComponent(name);
    });
  }).catch(() => {});

  function shapeScatter() {                          // 분해되어 흩어진 상태
    const d = rnd(1.1, 1.9), u = Math.random() * Math.PI * 2, v = Math.acos(rnd(-1, 1));
    return [d * Math.sin(v) * Math.cos(u), d * Math.cos(v) * 0.62, d * Math.sin(v) * Math.sin(u)];
  }

  const P = new Array(N);
  for (let i = 0; i < N; i++) {
    const s = CLOUDS[0][i] || [0, 0, 0];
    P[i] = { x: s[0], y: s[1], z: s[2], tx: s[0], ty: s[1], tz: s[2],
             sp: rnd(0.035, 0.075), spr: sprites[(Math.random() * sprites.length) | 0],
             tw: Math.random() * Math.PI * 2, tws: rnd(0.008, 0.045) };
  }

  function retargetShape(idx) {
    const cloud = CLOUDS[idx];
    for (let i = 0; i < N; i++) {
      const s = cloud[i] || [0, 0, 0, 0];
      P[i].tx = s[0]; P[i].ty = s[1]; P[i].tz = s[2];
      // 윤곽 입자는 금빛, 내부 입자는 흰빛·보라 계열
      P[i].spr = s[3]
        ? sprites[(Math.random() * WARM_N) | 0]
        : sprites[WARM_N + ((Math.random() * (sprites.length - WARM_N)) | 0)];
      P[i].edge = s[3];
    }
  }
  function retargetScatter() {                       // 화면 전체로 흩어짐
    for (let i = 0; i < N; i++) {
      const s = shapeScatter();
      P[i].tx = s[0] * 2.3; P[i].ty = s[1] * 2.3; P[i].tz = s[2];
    }
  }
  // 형상은 오래 머물고, 흩어짐은 짧게 지나간다
  let shapeIdx = 0, scattered = false, autoCycle = true, cycleTimer = null;
  function cycle() {
    if (!autoCycle) return;
    if (scattered) { shapeIdx = (shapeIdx + 1) % CLOUDS.length; retargetShape(shapeIdx); }
    else retargetScatter();
    scattered = !scattered;
    cycleTimer = setTimeout(cycle, scattered ? 2600 : 6400);
  }
  retargetShape(0);
  cycleTimer = setTimeout(cycle, 6400);

  /* 가사 단어로 즉석에서 만들 수 있는 아이콘들 */
  const PI2 = Math.PI * 2;
  const ICONS = {
    heart: (o, s) => { const u = s / 100, P = (x, y) => [x * u, y * u];
      o.beginPath(); o.moveTo(...P(50, 84));
      o.bezierCurveTo(...P(10, 56), ...P(16, 20), ...P(50, 34));
      o.bezierCurveTo(...P(84, 20), ...P(90, 56), ...P(50, 84));
      o.closePath(); o.fill(); },
    star: (o, s) => { const u = s / 100; o.beginPath();
      for (let i = 0; i < 10; i++) { const r = i % 2 ? 22 : 46, a = -Math.PI / 2 + i * Math.PI / 5;
        const x = (50 + r * Math.cos(a)) * u, y = (50 + r * Math.sin(a)) * u;
        i ? o.lineTo(x, y) : o.moveTo(x, y); } o.closePath(); o.fill(); },
    moon: (o, s) => { const u = s / 100;
      o.beginPath(); o.arc(50 * u, 50 * u, 38 * u, 0, PI2); o.fill();
      o.globalCompositeOperation = "destination-out";
      o.beginPath(); o.arc(66 * u, 42 * u, 33 * u, 0, PI2); o.fill();
      o.globalCompositeOperation = "source-over"; },
    sun: (o, s) => { const u = s / 100;
      o.beginPath(); o.arc(50 * u, 50 * u, 26 * u, 0, PI2); o.fill();
      o.lineWidth = 5 * u; o.strokeStyle = "#fff"; o.lineCap = "round";
      for (let i = 0; i < 12; i++) { const a = i * PI2 / 12;
        o.beginPath(); o.moveTo((50 + 33 * Math.cos(a)) * u, (50 + 33 * Math.sin(a)) * u);
        o.lineTo((50 + 44 * Math.cos(a)) * u, (50 + 44 * Math.sin(a)) * u); o.stroke(); } },
    flower: (o, s) => { const u = s / 100;
      for (let i = 0; i < 6; i++) { const a = i * PI2 / 6;
        o.beginPath(); o.ellipse((50 + 22 * Math.cos(a)) * u, (44 + 22 * Math.sin(a)) * u,
          15 * u, 11 * u, a, 0, PI2); o.fill(); }
      o.beginPath(); o.arc(50 * u, 44 * u, 11 * u, 0, PI2); o.fill();
      o.lineWidth = 5 * u; o.strokeStyle = "#fff";
      o.beginPath(); o.moveTo(50 * u, 60 * u); o.lineTo(50 * u, 92 * u); o.stroke(); },
    tree: (o, s) => { const u = s / 100;
      o.beginPath(); o.arc(50 * u, 36 * u, 26 * u, 0, PI2); o.fill();
      o.beginPath(); o.arc(32 * u, 52 * u, 19 * u, 0, PI2); o.fill();
      o.beginPath(); o.arc(68 * u, 52 * u, 19 * u, 0, PI2); o.fill();
      o.fillRect(44 * u, 58 * u, 12 * u, 36 * u); },
    rain: (o, s) => { const u = s / 100;
      o.beginPath(); o.arc(38 * u, 34 * u, 17 * u, 0, PI2);
      o.arc(58 * u, 32 * u, 21 * u, 0, PI2); o.arc(70 * u, 42 * u, 14 * u, 0, PI2);
      o.rect(34 * u, 36 * u, 42 * u, 16 * u); o.fill();
      [30, 46, 62, 76].forEach((x, i) => { o.beginPath();
        o.ellipse(x * u, (64 + (i % 2) * 12) * u, 4.5 * u, 9 * u, 0, 0, PI2); o.fill(); }); },
    tear: (o, s) => { const u = s / 100, P = (x, y) => [x * u, y * u];
      o.beginPath(); o.moveTo(...P(50, 12));
      o.bezierCurveTo(...P(78, 46), ...P(80, 62), ...P(72, 74));
      o.bezierCurveTo(...P(62, 90), ...P(38, 90), ...P(28, 74));
      o.bezierCurveTo(...P(20, 62), ...P(22, 46), ...P(50, 12));
      o.closePath(); o.fill(); },
    bird: (o, s) => { const u = s / 100, P = (x, y) => [x * u, y * u];
      o.beginPath(); o.moveTo(...P(50, 52));
      o.bezierCurveTo(...P(34, 26), ...P(14, 26), ...P(8, 42));
      o.bezierCurveTo(...P(24, 40), ...P(38, 48), ...P(48, 60));
      o.closePath(); o.fill();
      o.beginPath(); o.moveTo(...P(52, 52));
      o.bezierCurveTo(...P(68, 26), ...P(88, 26), ...P(94, 42));
      o.bezierCurveTo(...P(78, 40), ...P(64, 48), ...P(54, 60));
      o.closePath(); o.fill();
      o.beginPath(); o.ellipse(...P(50, 62), 10 * u, 16 * u, 0, 0, PI2); o.fill(); },
    butterfly: (o, s) => { const u = s / 100;
      [[-1, 34], [1, 34]].forEach(([sg, r]) => {
        o.beginPath(); o.ellipse((50 + sg * 24) * u, 36 * u, r * 0.62 * u, r * 0.72 * u, sg * 0.4, 0, PI2); o.fill();
        o.beginPath(); o.ellipse((50 + sg * 20) * u, 68 * u, r * 0.46 * u, r * 0.5 * u, -sg * 0.3, 0, PI2); o.fill(); });
      o.beginPath(); o.ellipse(50 * u, 52 * u, 5 * u, 26 * u, 0, 0, PI2); o.fill(); },
    fire: (o, s) => { const u = s / 100, P = (x, y) => [x * u, y * u];
      o.beginPath(); o.moveTo(...P(50, 8));
      o.bezierCurveTo(...P(74, 34), ...P(84, 52), ...P(76, 68));
      o.bezierCurveTo(...P(70, 86), ...P(30, 86), ...P(24, 68));
      o.bezierCurveTo(...P(16, 52), ...P(30, 40), ...P(38, 46));
      o.bezierCurveTo(...P(36, 30), ...P(44, 18), ...P(50, 8));
      o.closePath(); o.fill(); },
    wave: (o, s) => { const u = s / 100;
      o.lineWidth = 9 * u; o.strokeStyle = "#fff"; o.lineCap = "round";
      [34, 52, 70].forEach(y => { o.beginPath(); o.moveTo(8 * u, y * u);
        for (let x = 8; x <= 92; x += 4)
          o.lineTo(x * u, (y + 9 * Math.sin((x - 8) / 11)) * u);
        o.stroke(); }); },
    cloud: (o, s) => { const u = s / 100;
      o.beginPath(); o.arc(36 * u, 52 * u, 18 * u, 0, PI2);
      o.arc(56 * u, 44 * u, 24 * u, 0, PI2); o.arc(72 * u, 56 * u, 16 * u, 0, PI2);
      o.rect(34 * u, 52 * u, 40 * u, 18 * u); o.fill(); },
    mountain: (o, s) => { const u = s / 100, P = (x, y) => [x * u, y * u];
      o.beginPath(); o.moveTo(...P(6, 82)); o.lineTo(...P(36, 26)); o.lineTo(...P(56, 58));
      o.lineTo(...P(70, 38)); o.lineTo(...P(94, 82)); o.closePath(); o.fill(); },
    road: (o, s) => { const u = s / 100, P = (x, y) => [x * u, y * u];
      o.beginPath(); o.moveTo(...P(40, 14)); o.lineTo(...P(60, 14));
      o.lineTo(...P(92, 90)); o.lineTo(...P(8, 90)); o.closePath(); o.fill();
      o.globalCompositeOperation = "destination-out";
      [22, 44, 68].forEach((y, i) => o.fillRect(48 * u, y * u, 4 * u, (7 + i * 3) * u));
      o.globalCompositeOperation = "source-over"; },
    clock: (o, s) => { const u = s / 100;
      o.beginPath(); o.arc(50 * u, 50 * u, 40 * u, 0, PI2); o.fill();
      o.globalCompositeOperation = "destination-out";
      o.lineWidth = 4 * u; o.strokeStyle = "#000"; o.lineCap = "round";
      o.beginPath(); o.moveTo(50 * u, 50 * u); o.lineTo(50 * u, 26 * u);
      o.moveTo(50 * u, 50 * u); o.lineTo(68 * u, 58 * u); o.stroke();
      o.globalCompositeOperation = "source-over"; },
    key: (o, s) => { const u = s / 100;
      o.beginPath(); o.arc(30 * u, 40 * u, 20 * u, 0, PI2); o.fill();
      o.globalCompositeOperation = "destination-out";
      o.beginPath(); o.arc(30 * u, 40 * u, 8 * u, 0, PI2); o.fill();
      o.globalCompositeOperation = "source-over";
      o.fillRect(44 * u, 34 * u, 44 * u, 12 * u);
      o.fillRect(72 * u, 46 * u, 9 * u, 14 * u);
      o.fillRect(58 * u, 46 * u, 9 * u, 10 * u); },
    door: (o, s) => { const u = s / 100;
      o.fillRect(24 * u, 12 * u, 52 * u, 78 * u);
      o.globalCompositeOperation = "destination-out";
      o.fillRect(32 * u, 20 * u, 36 * u, 62 * u);
      o.globalCompositeOperation = "source-over";
      o.beginPath(); o.arc(38 * u, 52 * u, 4 * u, 0, PI2); o.fill(); },
    note: (o, s) => { const u = s / 100;
      o.beginPath(); o.ellipse(34 * u, 74 * u, 15 * u, 11 * u, -0.3, 0, PI2); o.fill();
      o.beginPath(); o.ellipse(74 * u, 64 * u, 15 * u, 11 * u, -0.3, 0, PI2); o.fill();
      o.fillRect(45 * u, 20 * u, 7 * u, 54 * u);
      o.fillRect(85 * u, 12 * u, 7 * u, 52 * u);
      o.beginPath(); o.moveTo(45 * u, 20 * u); o.lineTo(92 * u, 12 * u);
      o.lineTo(92 * u, 26 * u); o.lineTo(45 * u, 34 * u); o.closePath(); o.fill(); },
    umbrella: (o, s) => { const u = s / 100, P = (x, y) => [x * u, y * u];
      o.beginPath(); o.moveTo(...P(8, 52));
      o.bezierCurveTo(...P(14, 16), ...P(86, 16), ...P(92, 52));
      o.closePath(); o.fill();
      o.fillRect(47 * u, 50 * u, 6 * u, 34 * u);
      o.lineWidth = 6 * u; o.strokeStyle = "#fff"; o.lineCap = "round";
      o.beginPath(); o.moveTo(50 * u, 84 * u);
      o.quadraticCurveTo(50 * u, 94 * u, 38 * u, 90 * u); o.stroke(); },
    cup: (o, s) => { const u = s / 100, P = (x, y) => [x * u, y * u];
      o.beginPath(); o.moveTo(...P(22, 34)); o.lineTo(...P(70, 34));
      o.lineTo(...P(63, 86)); o.lineTo(...P(29, 86)); o.closePath(); o.fill();
      o.lineWidth = 8 * u; o.strokeStyle = "#fff";
      o.beginPath(); o.arc(72 * u, 50 * u, 14 * u, -1.1, 1.1); o.stroke(); },
    ring: (o, s) => { const u = s / 100;
      o.beginPath(); o.arc(50 * u, 60 * u, 30 * u, 0, PI2); o.fill();
      o.globalCompositeOperation = "destination-out";
      o.beginPath(); o.arc(50 * u, 60 * u, 21 * u, 0, PI2); o.fill();
      o.globalCompositeOperation = "source-over";
      o.beginPath(); o.moveTo(50 * u, 8 * u); o.lineTo(62 * u, 26 * u);
      o.lineTo(50 * u, 38 * u); o.lineTo(38 * u, 26 * u); o.closePath(); o.fill(); },
    house: (o, s) => { const u = s / 100, P = (x, y) => [x * u, y * u];
      o.beginPath(); o.moveTo(...P(50, 10)); o.lineTo(...P(92, 46));
      o.lineTo(...P(78, 46)); o.lineTo(...P(78, 88)); o.lineTo(...P(22, 88));
      o.lineTo(...P(22, 46)); o.lineTo(...P(8, 46)); o.closePath(); o.fill();
      o.globalCompositeOperation = "destination-out";
      o.fillRect(42 * u, 60 * u, 16 * u, 28 * u);
      o.globalCompositeOperation = "source-over"; },
    window_: (o, s) => { const u = s / 100;
      o.fillRect(16 * u, 14 * u, 68 * u, 72 * u);
      o.globalCompositeOperation = "destination-out";
      o.fillRect(24 * u, 22 * u, 22 * u, 26 * u); o.fillRect(54 * u, 22 * u, 22 * u, 26 * u);
      o.fillRect(24 * u, 54 * u, 22 * u, 26 * u); o.fillRect(54 * u, 54 * u, 22 * u, 26 * u);
      o.globalCompositeOperation = "source-over"; },
    car: (o, s) => { const u = s / 100, P = (x, y) => [x * u, y * u];
      o.beginPath(); o.moveTo(...P(10, 66)); o.lineTo(...P(18, 44));
      o.bezierCurveTo(...P(28, 32), ...P(72, 32), ...P(82, 44));
      o.lineTo(...P(90, 66)); o.lineTo(...P(90, 76)); o.lineTo(...P(10, 76));
      o.closePath(); o.fill();
      o.beginPath(); o.arc(30 * u, 76 * u, 10 * u, 0, PI2);
      o.arc(70 * u, 76 * u, 10 * u, 0, PI2); o.fill(); },
    plane: (o, s) => { const u = s / 100, P = (x, y) => [x * u, y * u];
      o.beginPath(); o.moveTo(...P(50, 8)); o.lineTo(...P(60, 44));
      o.lineTo(...P(94, 62)); o.lineTo(...P(94, 72)); o.lineTo(...P(58, 62));
      o.lineTo(...P(56, 82)); o.lineTo(...P(70, 92)); o.lineTo(...P(50, 88));
      o.lineTo(...P(30, 92)); o.lineTo(...P(44, 82)); o.lineTo(...P(42, 62));
      o.lineTo(...P(6, 72)); o.lineTo(...P(6, 62)); o.lineTo(...P(40, 44));
      o.closePath(); o.fill(); },
    phone: (o, s) => { const u = s / 100;
      if (o.roundRect) { o.beginPath(); o.roundRect(30 * u, 8 * u, 40 * u, 84 * u, 8 * u); o.fill(); }
      else o.fillRect(30 * u, 8 * u, 40 * u, 84 * u);
      o.globalCompositeOperation = "destination-out";
      o.fillRect(35 * u, 18 * u, 30 * u, 58 * u);
      o.globalCompositeOperation = "source-over"; },
    letter: (o, s) => { const u = s / 100, P = (x, y) => [x * u, y * u];
      o.fillRect(12 * u, 26 * u, 76 * u, 50 * u);
      o.globalCompositeOperation = "destination-out";
      o.lineWidth = 3.4 * u; o.strokeStyle = "#000";
      o.beginPath(); o.moveTo(...P(12, 26)); o.lineTo(...P(50, 56)); o.lineTo(...P(88, 26));
      o.stroke(); o.globalCompositeOperation = "source-over"; },
    book: (o, s) => { const u = s / 100, P = (x, y) => [x * u, y * u];
      o.beginPath(); o.moveTo(...P(50, 26));
      o.bezierCurveTo(...P(36, 16), ...P(18, 18), ...P(10, 24));
      o.lineTo(...P(10, 80)); o.bezierCurveTo(...P(20, 74), ...P(38, 74), ...P(50, 84));
      o.bezierCurveTo(...P(62, 74), ...P(80, 74), ...P(90, 80));
      o.lineTo(...P(90, 24)); o.bezierCurveTo(...P(82, 18), ...P(64, 16), ...P(50, 26));
      o.closePath(); o.fill();
      o.globalCompositeOperation = "destination-out";
      o.lineWidth = 3 * u; o.strokeStyle = "#000";
      o.beginPath(); o.moveTo(...P(50, 28)); o.lineTo(...P(50, 84)); o.stroke();
      o.globalCompositeOperation = "source-over"; },
    candle: (o, s) => { const u = s / 100, P = (x, y) => [x * u, y * u];
      o.beginPath(); o.moveTo(...P(50, 8));
      o.bezierCurveTo(...P(62, 22), ...P(62, 34), ...P(50, 40));
      o.bezierCurveTo(...P(38, 34), ...P(38, 22), ...P(50, 8));
      o.closePath(); o.fill();
      o.fillRect(38 * u, 44 * u, 24 * u, 48 * u); },
    balloon: (o, s) => { const u = s / 100, P = (x, y) => [x * u, y * u];
      o.beginPath(); o.ellipse(...P(50, 40), 28 * u, 33 * u, 0, 0, PI2); o.fill();
      o.beginPath(); o.moveTo(...P(44, 72)); o.lineTo(...P(56, 72));
      o.lineTo(...P(50, 80)); o.closePath(); o.fill();
      o.lineWidth = 3 * u; o.strokeStyle = "#fff";
      o.beginPath(); o.moveTo(...P(50, 80));
      o.bezierCurveTo(...P(58, 88), ...P(42, 90), ...P(50, 96)); o.stroke(); },
    crown: (o, s) => { const u = s / 100, P = (x, y) => [x * u, y * u];
      o.beginPath(); o.moveTo(...P(10, 76)); o.lineTo(...P(16, 26));
      o.lineTo(...P(33, 48)); o.lineTo(...P(50, 18)); o.lineTo(...P(67, 48));
      o.lineTo(...P(84, 26)); o.lineTo(...P(90, 76)); o.closePath(); o.fill(); },
    wing: (o, s) => { const u = s / 100, P = (x, y) => [x * u, y * u];
      o.beginPath(); o.moveTo(...P(50, 20));
      o.bezierCurveTo(...P(30, 22), ...P(10, 40), ...P(8, 66));
      o.bezierCurveTo(...P(24, 56), ...P(40, 58), ...P(50, 70));
      o.closePath(); o.fill();
      o.beginPath(); o.moveTo(...P(50, 20));
      o.bezierCurveTo(...P(70, 22), ...P(90, 40), ...P(92, 66));
      o.bezierCurveTo(...P(76, 56), ...P(60, 58), ...P(50, 70));
      o.closePath(); o.fill(); },
    rainbow: (o, s) => { const u = s / 100;
      o.lineWidth = 8 * u;
      [40, 30, 20].forEach(r => { o.strokeStyle = "#fff";
        o.beginPath(); o.arc(50 * u, 74 * u, r * u, Math.PI, 0); o.stroke(); }); },
    lightning: (o, s) => { const u = s / 100, P = (x, y) => [x * u, y * u];
      o.beginPath(); o.moveTo(...P(56, 6)); o.lineTo(...P(28, 52));
      o.lineTo(...P(46, 52)); o.lineTo(...P(38, 94)); o.lineTo(...P(72, 42));
      o.lineTo(...P(52, 42)); o.lineTo(...P(64, 6)); o.closePath(); o.fill(); },
    gift: (o, s) => { const u = s / 100;
      o.fillRect(14 * u, 40 * u, 72 * u, 50 * u);
      o.fillRect(8 * u, 26 * u, 84 * u, 16 * u);
      o.globalCompositeOperation = "destination-out";
      o.fillRect(44 * u, 26 * u, 12 * u, 64 * u);
      o.globalCompositeOperation = "source-over";
      o.beginPath(); o.ellipse(38 * u, 20 * u, 12 * u, 9 * u, 0, 0, PI2);
      o.ellipse(62 * u, 20 * u, 12 * u, 9 * u, 0, 0, PI2); o.fill(); },
    mirror: (o, s) => { const u = s / 100;
      o.beginPath(); o.ellipse(50 * u, 42 * u, 30 * u, 36 * u, 0, 0, PI2); o.fill();
      o.fillRect(44 * u, 76 * u, 12 * u, 18 * u);
      o.fillRect(32 * u, 90 * u, 36 * u, 8 * u); },
    snowflake: (o, s) => { const u = s / 100;
      o.lineWidth = 5 * u; o.strokeStyle = "#fff"; o.lineCap = "round";
      for (let i = 0; i < 6; i++) { const a = i * PI2 / 6;
        const ex = (50 + 42 * Math.cos(a)) * u, ey = (50 + 42 * Math.sin(a)) * u;
        o.beginPath(); o.moveTo(50 * u, 50 * u); o.lineTo(ex, ey); o.stroke();
        [0.55, 0.8].forEach(t => { const bx = 50 + 42 * t * Math.cos(a), by = 50 + 42 * t * Math.sin(a);
          [-0.6, 0.6].forEach(da => { o.beginPath(); o.moveTo(bx * u, by * u);
            o.lineTo((bx + 12 * Math.cos(a + da)) * u, (by + 12 * Math.sin(a + da)) * u);
            o.stroke(); }); }); } },
  };

  /* 이모지 글리프를 실루엣으로 — 미리 만든 아이콘이 없어도 그림 형상을 즉석 생성 */
  function drawEmoji(ch) {
    return (o, s) => {
      o.textAlign = "center"; o.textBaseline = "middle";
      o.font = `${Math.round(s * 0.82)}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
      o.fillText(ch, s / 2, s * 0.53);
      // 컬러 이모지는 색이 들어오므로 알파만 남겨 실루엣으로 바꾼다
      const img = o.getImageData(0, 0, s, s);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] > 40) { d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = 255; }
        else d[i + 3] = 0;
      }
      o.putImageData(img, 0, 0);
    };
  }

  /* 가사 속 단어 자체를 글자 형상으로 만든다 (아이콘이 없는 어떤 단어든 가능) */
  function drawWord(word) {
    return (o, s) => {
      const txt = (word || "").slice(0, 6);
      if (!txt) { o.beginPath(); o.arc(s / 2, s / 2, s * 0.3, 0, PI2); o.fill(); return; }
      o.textAlign = "center"; o.textBaseline = "middle";
      let size = s * 0.42;
      o.font = `700 ${size}px Inter, "Malgun Gothic", sans-serif`;
      let w = o.measureText(txt).width;
      if (w > s * 0.88) { size *= (s * 0.88) / w; o.font = `700 ${size}px Inter, "Malgun Gothic", sans-serif`; }
      o.fillText(txt, s / 2, s / 2);
    };
  }

  const genCache = new Map();
  function buildCloud(key, drawFn) {
    if (genCache.has(key)) return genCache.get(key);
    const cloud = samplePoints(drawFn, N);
    genCache.set(key, cloud);
    return cloud;
  }
  function showCloud(cloud) {
    if (!cloud || !cloud.length) return;
    autoCycle = false;
    if (cycleTimer) clearTimeout(cycleTimer);
    for (let i = 0; i < N; i++) {
      const s = cloud[i] || [0, 0, 0, 0];
      P[i].tx = s[0]; P[i].ty = s[1]; P[i].tz = s[2];
      P[i].spr = s[3] ? sprites[(Math.random() * WARM_N) | 0]
                      : sprites[WARM_N + ((Math.random() * (sprites.length - WARM_N)) | 0)];
      P[i].edge = s[3];
    }
  }

  /* 외부 제어 API — 음악 비주얼라이저에서 사용 */
  const SHAPE_NAMES = ["뇌", "얼굴", "손", "눈", "강아지", "고양이", "지구",
                       "오리온자리", "세모", "북두칠성", "마우스", "카시오페이아",
                       "네모", "백조자리", "키보드", "전갈자리", "돛", "필름"];
  let pulse = 0;                                   // 0~1, 비트 강도
  window.Particles = {
    names: () => SHAPE_NAMES.slice(0, CLOUDS.length),
    count: () => CLOUDS.length,
    setAuto(on) {
      autoCycle = on;
      if (cycleTimer) clearTimeout(cycleTimer);
      if (on) cycleTimer = setTimeout(cycle, 3000);
    },
    show(i) {                                      // 특정 형상으로 즉시 전환
      if (i == null) return;
      shapeIdx = ((i % CLOUDS.length) + CLOUDS.length) % CLOUDS.length;
      retargetShape(shapeIdx);
    },
    burst() { retargetScatter(); },                // 흩뿌리기 (간주·비트 강조용)
    setPulse(v) { pulse = Math.max(0, Math.min(1.6, v)); },
    _getPulse: () => pulse,
    icons: () => Object.keys(ICONS),
    /* 미리보기용: 해당 형상을 작은 캔버스에 그려준다 */
    drawPreview(icon, word, cv, emoji) {
      const s = cv.width;
      const o = cv.getContext("2d");
      o.clearRect(0, 0, s, s);
      o.fillStyle = "#ffb829";
      let fn = null;
      if (icon && ICONS[icon]) fn = ICONS[icon];
      else {
        const named = SHAPE_NAMES.indexOf(icon);
        if (named >= 0 && SILHOUETTES[named]) fn = SILHOUETTES[named];
      }
      if (!fn && emoji) { o.fillStyle = "#42d6c3"; fn = drawEmoji(emoji); }
      if (!fn) { o.fillStyle = "#8052ff"; fn = drawWord(word); }
      o.save();
      try { fn(o, s); } catch (e) {}
      o.restore();
    },
    /* 가사 한 줄에서 형상을 즉석 생성해 보여준다.
       icon 이름이 있으면 그 아이콘, 없으면 단어 자체를 글자 형상으로 만든다. */
    showFor(icon, word, emoji) {
      if (icon && ICONS[icon]) return showCloud(buildCloud("i:" + icon, ICONS[icon]));
      const named = SHAPE_NAMES.indexOf(icon);
      if (named >= 0 && CLOUDS[named]) return showCloud(CLOUDS[named]);
      if (emoji) return showCloud(buildCloud("e:" + emoji, drawEmoji(emoji)));
      if (word) return showCloud(buildCloud("w:" + word, drawWord(word)));
      return showCloud(CLOUDS[0]);
    },
  };

  let rot = 0, last = performance.now(), t0 = performance.now();
  let aimX = 0.19, aimS = 0.44;                      // 형상 중심·크기 (무대 모드에서 이동)
  // 배경 동작 모드: on(움직임) / still(정지 화면) / off(끔) — 느린 PC에서 끌 수 있다
  // 기본값: 정지 — 세일링스톤 로고 모양이 만들어진 뒤 그 화면에서 멈춘다 (느린 PC 배려)
  let MODE = localStorage.getItem("bgMode") || "still";
  let stillDone = false;
  let FORCE = false, rafOn = false;                  // FORCE: 뮤직비주얼 재생 중엔 항상 움직임
  let fpsN = 0, fpsT = 0, autoChecked = localStorage.getItem("bgAutoChecked") === "1";
  function startLoop() { if (!rafOn) { rafOn = true; requestAnimationFrame(frame); } }
  function frame(now, offline) {
    if (!offline && MODE !== "on" && !FORCE) { rafOn = false; return; }  // still이면 마지막 화면이 남는다
    const dt = Math.min(50, now - last); last = now;
    // 아주 느린 PC를 자동 감지해 한 번만 '정지'로 내린다 (탭이 숨겨져 있을 땐 측정하지 않음)
    if (!autoChecked && document.visibilityState === "visible") {
      fpsN++; fpsT += dt;
      if (fpsT > 4000) {
        const fps = fpsN / (fpsT / 1000);
        if (fps < 11) {
          autoChecked = true;
          localStorage.setItem("bgAutoChecked", "1");
          window.Particles.setMode("still");
          const b = document.getElementById("bgToggle");
          if (b) b.title = "이 PC에서 배경이 너무 느려 자동으로 정지했습니다";
        } else if (fpsT > 8000) { autoChecked = true; }
        fpsN = 0; fpsT = 0;
      }
    }
    rot += dt * 0.00026;                             // 회전을 키워 입체감이 드러나게
    // 전체가 천천히 밝아졌다 흐려지는 호흡 (형상이 모일 때 가장 밝게)
    const breath = 0.72 + 0.28 * Math.sin((now - t0) * 0.00055);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);

    // 형상이 모이는 중심을 화면 왼쪽 빈 영역에 둔다 (레퍼런스와 동일한 구도).
    // 전체화면 무대(뮤직비주얼 재생)에서는 가릴 UI가 없으니 가운데로 옮기고 크게 키운다.
    const stageOn = document.body.classList.contains("stageOn");
    aimX += ((stageOn ? 0.5 : 0.19) - aimX) * 0.06;   // 부드럽게 이동
    aimS += ((stageOn ? 0.50 : 0.44) - aimS) * 0.06;
    const cx = W * aimX, cy = H * (stageOn ? 0.48 : 0.54);
    // 비트에 맞춰 전체가 두근거린다
    const beat = window.Particles ? window.Particles._getPulse() : 0;
    const scale = Math.min(W, H) * aimS * (1 + 0.13 * beat);
    const jit = (0.9 + 5.0 * Math.min(1.4, beat)) * SIZE_SCALE;   // 흩날림 폭 (형상은 유지)
    const cos = Math.cos(rot), sin = Math.sin(rot);

    for (let i = 0; i < N; i++) {
      const p = P[i];
      p.x += (p.tx - p.x) * p.sp;
      p.y += (p.ty - p.y) * p.sp;
      p.z += (p.tz - p.z) * p.sp;
      const rx = p.x * cos - p.z * sin;
      const rz = p.x * sin + p.z * cos;
      const persp = 2.2 / (2.2 + rz);                // 원근을 강하게 → 앞뒤 차이 뚜렷
      const sx = cx + rx * scale * persp;
      const sy = cy + p.y * scale * persp;
      if (sx < -20 || sx > W + 20 || sy < -20 || sy > H + 20) continue;
      p.tw += p.tws;
      // 입자마다 다른 주기로 반짝임 + 전체 호흡
      const twinkle = 0.42 + 0.58 * (0.5 + 0.5 * Math.sin(p.tw));
      const rim = p.edge ? 1.5 : 1.05;               // 윤곽을 더 밝게 → 형상이 또렷해짐
      // 뒤쪽(rz>0) 입자는 어둡게, 앞쪽은 밝게 → 구체 같은 명암
      const depthShade = 0.45 + 0.55 * (1 - Math.min(1, Math.max(0, (rz + 1) / 2)));
      const alpha = (0.30 + 0.60 * persp) * twinkle * (0.55 + 0.45 * breath) * rim * depthShade;
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      const sz = (2.6 + 1.2 * twinkle) * persp * SIZE_SCALE;   // 크기 -40%, 개수 2배
      // 입자가 제자리에 멈춰 있지 않고 계속 흩날린다 (비트가 셀수록 크게)
      const jx = Math.sin(p.tw * 1.7) * jit, jy = Math.cos(p.tw * 2.3) * jit;
      ctx.drawImage(p.spr, sx + jx - sz / 2, sy + jy - sz / 2, sz, sz);
    }
    ctx.globalAlpha = 1;
    drawCaption();
    if (offline) return;                 // 영상 굽기: 다음 프레임은 호출한 쪽이 정한다
    rafOn = false;
    startLoop();
  }

  /* 하단 가사 자막: 현재 가사는 크고 밝게, 지나간 가사는 위로 흐려지며 올라가고
     다음 가사는 아래에 희미하게 — 노래방처럼 시간에 맞춰 스크롤된다.
     캔버스에 직접 그리므로 화면에 보이는 그대로 영상에도 담긴다. */
  let CAP = null;            // {title, word, time, lines:[{start,text}]}
  let capScroll = 0;         // 현재 줄 위치(실수) — 목표 줄로 부드럽게 이동
  function drawCaption() {
    if (!CAP) return;
    const lines = CAP.lines || [];
    const big = Math.max(18, Math.round(H * 0.042));
    const lineH = big * 1.55;
    const baseY = H - Math.round(H * 0.175);   // 아래로 다음 가사 2줄이 들어갈 자리를 남긴다
    ctx.save();
    ctx.textAlign = "center";
    ctx.shadowColor = "rgba(0,0,0,0.95)";

    if (lines.length) {
      let idx = 0;
      for (let i = 0; i < lines.length; i++) {
        if (CAP.time >= lines[i].start) idx = i; else break;
      }
      if (CAP.time < lines[0].start - 0.05) idx = -1;     // 전주에는 첫 줄이 아래에서 대기
      capScroll += (idx - capScroll) * 0.10;
      for (let k = Math.max(0, Math.floor(capScroll) - 2);
           k <= Math.min(lines.length - 1, Math.ceil(capScroll) + 2); k++) {
        const d = k - capScroll;                          // 음수=지나감(위), 양수=예정(아래)
        const ad = Math.min(2.6, Math.abs(d));
        const a = Math.max(0, 1 - ad * 0.42);
        if (a <= 0.02) continue;
        const sz = big * (1 - 0.30 * Math.min(1, ad));
        ctx.globalAlpha = a;
        ctx.font = `${ad < 0.5 ? 700 : 500} ${Math.round(sz)}px "Pretendard", system-ui, sans-serif`;
        ctx.fillStyle = ad < 0.5 ? "#ffffff" : "#cfcfd6";
        ctx.shadowBlur = Math.round(sz * 0.8);
        wrapText(lines[k].text, W / 2, baseY + d * lineH, W * 0.84, sz);
      }
      ctx.globalAlpha = 1;
    }
    if (CAP.title) {
      ctx.textAlign = "left";
      ctx.font = `600 ${Math.max(13, Math.round(H * 0.021))}px "Pretendard", system-ui, sans-serif`;
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.shadowBlur = 10;
      ctx.fillText(CAP.title, Math.round(W * 0.035), Math.round(H * 0.062));
    }
    ctx.restore();
  }
  // 긴 줄은 두 줄로 접어 그린다
  function wrapText(text, x, y, maxW, sz) {
    if (!text) return;
    if (ctx.measureText(text).width <= maxW) { ctx.fillText(text, x, y); return; }
    const words = text.split(" ");
    let a = "", b = "";
    words.forEach(w => {
      if (!b && ctx.measureText(a + " " + w).width < maxW) a += (a ? " " : "") + w;
      else b += (b ? " " : "") + w;
    });
    ctx.fillText(a, x, y - sz * 0.55);
    ctx.fillText(b, x, y + sz * 0.6);
  }
  window.Particles.setExport = function (size) {   // {w,h} 또는 null
    EXPORT = size || null;
    resize();
  };
  window.Particles.setCaption = function (cap) { CAP = cap || null; };
  // 영상 굽기용: 가상 시계로 한 프레임만 그린다 (실시간 재생 없이 빠르게)
  window.Particles.renderOne = function (nowMs) { frame(nowMs, true); };
  window.Particles.getMode = function () { return MODE; };
  // 정지 모드: 로고 형상이 다 모일 때까지만 돌리고 그 화면에서 멈춘다
  function showLogoThenFreeze() {
    stillDone = true;
    window.Particles.setAuto(false);
    if (LOGO_CLOUD) showCloud(LOGO_CLOUD);
    for (let i = 0; i < N; i++) {          // 형상이 모이는 과정을 건너뛰고 즉시 완성
      const p = P[i]; p.x = p.tx; p.y = p.ty; p.z = p.tz;
    }
    frame(performance.now(), true);        // 딱 한 장 그리고 멈춘다 (CPU 사용 없음)
  }
  window.Particles.setMode = function (m) {        // "on" | "still" | "off"
    MODE = m;
    localStorage.setItem("bgMode", m);
    cv.style.display = m === "off" ? "none" : "block";
    if (m === "on") { window.Particles.setAuto(true); last = performance.now(); startLoop(); }
    else if (m === "still") { stillDone = false; last = performance.now(); showLogoThenFreeze(); }
    document.dispatchEvent(new CustomEvent("bgmode", { detail: m }));
  };
  // 뮤직비주얼 재생·녹화 중에는 배경 설정과 상관없이 반드시 움직인다
  window.Particles.setForce = function (on) {
    FORCE = !!on;
    if (on) { cv.style.display = "block"; last = performance.now(); startLoop(); }
    else if (MODE === "off") cv.style.display = "none";
  };

  cv.style.display = MODE === "off" ? "none" : "block";   // 저장된 설정을 처음부터 적용
  startLoop();
})();
document.dispatchEvent(new Event("particles-ready"));   // 준비 완료 알림
