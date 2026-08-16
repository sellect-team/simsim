"""가사 인식(faster-whisper)과 가사 → 형상 매핑.

가사에 실제로 나오는 낱말만 형상으로 삼는다(무관한 아이콘은 쓰지 않는다).
사전(WORD_EMOJI)을 늘리면 나오는 형상 종류가 그대로 늘어난다.
"""
import os
import re
import threading

from aiohttp import web

from paths import AUDIO_DIR, JOBS


LYRIC_SHAPES = [
    # 구체적인 낱말을 먼저 검사한다 (예: "밤하늘의 별"이 "바라보며"보다 우선)
    (("밤하늘", "별빛", "별을", "별이", "은하", "우주", "星", "star", "galaxy"), "오리온자리"),
    (("바다", "파도", "항해", "돛", "sea", "ocean", "sail", "wave"), "돛"),
    (("생각", "머리", "기억", "마음속", "꿈꾸", "상상", "mind", "brain", "think", "dream"), "뇌"),
    (("얼굴", "미소", "너의 모습", "표정", "face", "smile"), "얼굴"),
    (("손", "잡아", "잡은", "손길", "hand", "hold"), "손"),
    (("눈물", "눈빛", "눈을", "시선", "바라", "eye", "tear", "look", "see"), "눈"),
    (("강아지", "개", "멍멍", "puppy", "dog"), "강아지"),
    (("고양이", "야옹", "cat", "kitten"), "고양이"),
    (("세상", "지구", "세계", "여행", "world", "earth", "globe"), "지구"),
    (("빛", "반짝", "shine", "light", "sparkle"), "북두칠성"),
    (("사랑", "설레", "심장", "두근", "love", "heart"), "카시오페이아"),
    (("영화", "장면", "필름", "추억", "movie", "film", "scene"), "필름"),
    (("길", "걸어", "떠나", "road", "walk", "go"), "백조자리"),
    (("아픔", "상처", "무서", "어둠", "pain", "dark", "fear"), "전갈자리"),
]


DEFAULT_ROTATION = ["뇌", "지구", "오리온자리", "얼굴", "북두칠성", "손",
                    "카시오페이아", "눈", "백조자리", "필름"]


async def api_transcribe(request):
    """업로드된 음악에서 가사와 시간을 자동 인식 (로컬 faster-whisper)"""
    data = await request.json()
    audio_name = re.sub(r"[^\w\-가-힣.]", "_", os.path.basename(str(data.get("audio") or "")))
    path = os.path.join(AUDIO_DIR, audio_name)
    if not audio_name or not os.path.exists(path):
        return web.json_response({"error": "먼저 음악 파일을 올려주세요."}, status=400)
    try:
        import transcribe as tr
    except Exception as e:
        return web.json_response({"error": "음성인식 모듈 로드 실패: " + str(e)[:150]}, status=500)
    if not tr.available():
        return web.json_response({"error": "faster-whisper가 설치되지 않았습니다."}, status=500)
    size = data.get("size") if data.get("size") in ("tiny", "base", "small", "medium") else "small"
    lang = data.get("language") or None
    job_id = "job_" + format(random.randint(0, 16**8 - 1), "08x")
    JOBS[job_id] = {"state": "running", "progress": 0,
                    "note": "모델을 준비하는 중… (처음 실행 시 다운로드가 있을 수 있습니다)"}

    def report(done, total, n):
        pct = int(min(99, max(1, done / total * 100))) if total else 1
        JOBS[job_id] = {"state": "running", "progress": pct,
                        "note": f"{int(done)}초 / {int(total)}초 인식 · {n}줄 추출"}

    async def run():
        try:
            result = await asyncio.get_event_loop().run_in_executor(
                None, lambda: tr.transcribe(path, size, lang, report))
            JOBS[job_id] = {"state": "done", "progress": 100, **result}
        except Exception as e:
            JOBS[job_id] = {"state": "error", "error": "인식 실패: " + str(e)[:250]}

    asyncio.get_event_loop().create_task(run())
    return web.json_response({"job": job_id})


# 가사 단어 → 그려낼 아이콘 (index.html의 ICONS 키와 일치)


WORD_ICONS = [
    (("사랑", "설레", "심장", "두근", "love", "heart"), "heart"),
    (("별", "밤하늘", "star", "stars"), "star"),
    (("달", "달빛", "moon", "moonlight"), "moon"),
    (("해", "햇살", "태양", "sun", "sunlight", "sunshine"), "sun"),
    (("꽃", "장미", "flower", "rose", "bloom"), "flower"),
    (("나무", "숲", "tree", "forest"), "tree"),
    (("비", "빗물", "rain", "raining"), "rain"),
    (("눈물", "tear", "tears", "cry"), "tear"),
    (("새", "날개", "날아", "bird", "wing", "fly"), "bird"),
    (("나비", "butterfly"), "butterfly"),
    (("불", "타올라", "fire", "flame", "burn"), "fire"),
    (("바다", "파도", "sea", "ocean", "wave"), "wave"),
    (("구름", "cloud", "sky"), "cloud"),
    (("산", "언덕", "mountain", "hill"), "mountain"),
    (("골목길", "road", "highway"), "road"),
    (("시간", "시계", "기다", "time", "clock", "wait"), "clock"),
    (("열쇠", "key"), "key"),
    (("문", "door", "gate"), "door"),
    (("음악", "노래", "멜로디", "music", "song", "melody", "sing"), "note"),
    (("우산", "umbrella"), "umbrella"),
    (("커피", "coffee", "cup"), "cup"),
    (("반지", "ring"), "ring"),
    (("눈꽃", "겨울", "snow", "winter"), "snowflake"),
    (("집", "방", "우리집", "home", "house", "room"), "house"),
    (("창", "창문", "창밖", "window"), "window_"),
    (("차", "자동차", "드라이브", "car", "drive"), "car"),
    (("비행기", "하늘로", "plane", "flight"), "plane"),
    (("전화", "연락", "phone", "call"), "phone"),
    (("편지", "메시지", "letter", "message"), "letter"),
    (("책", "이야기", "book", "story"), "book"),
    (("촛불", "candle"), "candle"),
    (("풍선", "balloon"), "balloon"),
    (("왕관", "빛나는 너", "crown", "queen", "king"), "crown"),
    (("날개", "wing", "wings"), "wing"),
    (("무지개", "rainbow"), "rainbow"),
    (("번개", "천둥", "lightning", "thunder"), "lightning"),
    (("선물", "gift", "present"), "gift"),
    (("거울", "mirror", "reflection"), "mirror"),
    (("얼굴", "미소", "웃", "face", "smile", "laugh"), "얼굴"),
    (("손", "잡아", "hand", "hold", "touch"), "손"),
    (("생각", "기억", "꿈", "mind", "brain", "dream", "remember"), "뇌"),
    (("세상", "지구", "world", "earth"), "지구"),
    (("강아지", "개", "dog", "puppy"), "강아지"),
    (("고양이", "cat"), "고양이"),
]
# 추상·감정 어휘 — 구체적인 사물 이름을 모두 확인한 뒤에만 사용한다


ABSTRACT_ICONS = [
    (("보고싶", "그리워", "그립", "안아", "입맞", "miss", "kiss", "hug", "baby", "honey",
      "너를", "너와", "우리", "함께", "영원", "forever", "together"), "heart"),
    (("빛나", "눈부", "환하", "밝", "bright", "glow", "shining"), "sun"),
    (("어둠", "밤", "잠", "새벽", "night", "dark", "sleep", "dawn"), "moon"),
    (("춤", "노래해", "리듬", "beat", "dance", "rhythm", "sound"), "note"),
    (("바람", "숨", "불어", "wind", "breath", "blow"), "cloud"),
    (("눈물", "울", "슬프", "아파", "cry", "sad", "hurt", "pain"), "tear"),
    (("뜨겁", "타올", "열정", "burn", "hot", "passion"), "fire"),
    (("자유", "훨훨", "날아", "free", "freedom", "fly"), "wing"),
    (("기다", "시간", "언젠가", "wait", "time", "someday", "moment"), "clock"),
    (("가자", "떠나", "달려", "돌아", "걸어", "길", "go", "run", "away", "back", "leave", "walk"), "road"),
    (("약속", "믿", "promise", "believe", "trust"), "key"),
    (("시작", "끝", "마지막", "처음", "start", "end", "last", "first"), "door"),
]
# 아이콘을 못 찾았을 때 글자 대신 쓸 순환 아이콘 (이미지 비율을 높인다)


FALLBACK_ICONS = ["star", "heart", "cloud", "wave", "note", "moon", "flower",
                  "bird", "sun", "mountain"]

# 미리 만든 아이콘이 없는 단어는 이모지 글리프를 실루엣으로 바꿔 즉석 생성한다.
# (윈도우 Segoe UI Emoji 기준 — 수천 개 그림을 별도 제작 없이 쓸 수 있다)


WORD_EMOJI = {
    # 자연·날씨
    "하늘": "🌤", "구름": "☁", "노을": "🌅", "일출": "🌄", "석양": "🌇", "안개": "🌫",
    "폭풍": "🌪", "무지개": "🌈", "우주": "🌌", "지평선": "🌅", "봄": "🌸", "여름": "🌞",
    "가을": "🍂", "겨울": "❄", "벚꽃": "🌸", "단풍": "🍁", "잎": "🍃", "풀": "🌿",
    "씨앗": "🌱", "사막": "🏜", "섬": "🏝", "화산": "🌋", "강": "🏞", "호수": "🏞",
    # 사람·감정
    "친구": "🧑‍🤝‍🧑", "가족": "👨‍👩‍👧", "엄마": "👩", "아빠": "👨", "아이": "🧒",
    "너": "🫵", "나": "🙋", "우리": "👥", "이별": "💔", "아픔": "💔", "행복": "😊",
    "웃음": "😄", "슬픔": "😢", "화": "😠", "놀람": "😮", "잠": "😴", "키스": "💋",
    "포옹": "🫂", "박수": "👏", "기도": "🙏", "인사": "👋", "춤": "💃", "노래": "🎤",
    # 사물
    "기타": "🎸", "피아노": "🎹", "드럼": "🥁", "마이크": "🎤", "헤드폰": "🎧",
    "카메라": "📷", "티켓": "🎫", "지도": "🗺", "나침반": "🧭", "가방": "🎒",
    "모자": "🎩", "신발": "👟", "옷": "👕", "안경": "👓", "시계": "⌚", "돈": "💰",
    "케이크": "🍰", "커피": "☕", "술": "🍺", "사탕": "🍬", "선물": "🎁", "폭죽": "🎆",
    "촛불": "🕯", "전구": "💡", "지우개": "🧽", "연필": "✏", "종이": "📄",
    # 탈것·장소
    "기차": "🚆", "버스": "🚌", "자전거": "🚲", "배": "⛵", "로켓": "🚀", "지하철": "🚇",
    "학교": "🏫", "병원": "🏥", "교회": "⛪", "도시": "🏙", "공원": "🏞", "다리": "🌉",
    "계단": "🪜", "골목": "🏘", "정류장": "🚏",
    # 추상
    "시간": "⏳", "운명": "🔮", "비밀": "🤫", "거짓말": "🤥", "진실": "💎",
    "희망": "🌟", "용기": "🔥", "평화": "🕊", "승리": "🏆", "여행": "🧳",
    # English
    "sky": "🌤", "sunset": "🌅", "storm": "🌪", "spring": "🌸", "summer": "🌞",
    "autumn": "🍂", "friend": "🧑‍🤝‍🧑", "family": "👨‍👩‍👧", "goodbye": "💔",
    "happy": "😊", "sad": "😢", "kiss": "💋", "guitar": "🎸", "piano": "🎹",
    "camera": "📷", "ticket": "🎫", "map": "🗺", "train": "🚆", "bus": "🚌",
    "bike": "🚲", "boat": "⛵", "rocket": "🚀", "school": "🏫", "city": "🏙",
    "bridge": "🌉", "hope": "🌟", "peace": "🕊", "trophy": "🏆", "travel": "🧳",
    "coffee": "☕", "cake": "🍰", "party": "🎉", "angel": "👼", "devil": "😈",
}

# 형상 어휘 확장 — 여기 있는 단어가 가사에 나오면 그 글리프를 실시간으로 래스터화해
# 입자 실루엣(3D 형상)으로 즉석 생성한다. 항목을 늘릴수록 나오는 형상 종류가 늘어난다.
WORD_EMOJI.update({
    # 동물
    "강아지": "🐶", "개": "🐶", "고양이": "🐱", "냥": "🐱", "토끼": "🐰", "곰": "🐻",
    "여우": "🦊", "늑대": "🐺", "사자": "🦁", "호랑이": "🐯", "말": "🐴", "소": "🐮",
    "돼지": "🐷", "양": "🐑", "원숭이": "🐵", "판다": "🐼", "코끼리": "🐘", "기린": "🦒",
    "펭귄": "🐧", "새": "🐦", "비둘기": "🕊", "부엉이": "🦉", "독수리": "🦅", "닭": "🐔",
    "물고기": "🐟", "돌고래": "🐬", "고래": "🐳", "상어": "🦈", "거북": "🐢", "뱀": "🐍",
    "개구리": "🐸", "나비": "🦋", "벌": "🐝", "무당벌레": "🐞", "달팽이": "🐌",
    "공룡": "🦕", "유니콘": "🦄", "용": "🐉", "사슴": "🦌", "다람쥐": "🐿",
    # 몸·사람
    "손": "✋", "주먹": "✊", "손가락": "👆", "발": "🦶", "눈": "👁", "귀": "👂",
    "입": "👄", "코": "👃", "머리": "🧠", "심장": "🫀", "뼈": "🦴", "이빨": "🦷",
    "아기": "👶", "소년": "👦", "소녀": "👧", "남자": "👨", "여자": "👩",
    "할머니": "👵", "할아버지": "👴", "왕": "🤴", "공주": "👸", "영웅": "🦸",
    "천사": "👼", "유령": "👻", "로봇": "🤖", "외계인": "👽", "광대": "🤡",
    # 감정·상태
    "사랑": "❤", "마음": "💗", "설렘": "💓", "눈물": "😭", "미소": "🙂",
    "윙크": "😉", "무서움": "😱", "부끄": "😊", "생각": "💭", "꿈": "💤",
    "외로": "🥺", "그리": "🥹", "고백": "💌", "약속": "🤝", "감사": "🙏",
    # 자연·하늘
    "태양": "☀", "해": "☀", "달": "🌙", "별": "⭐", "유성": "☄", "은하": "🌌",
    "지구": "🌍", "행성": "🪐", "비": "🌧", "눈꽃": "❄", "번개": "⚡", "바람": "🌬",
    "불": "🔥", "물": "💧", "파도": "🌊", "바다": "🌊", "산": "⛰", "나무": "🌳",
    "숲": "🌲", "꽃": "🌸", "장미": "🌹", "해바라기": "🌻", "튤립": "🌷",
    "네잎": "🍀", "선인장": "🌵", "야자": "🌴", "버섯": "🍄", "돌": "🪨",
    # 음식
    "밥": "🍚", "빵": "🍞", "피자": "🍕", "치킨": "🍗", "라면": "🍜", "국수": "🍜",
    "초콜릿": "🍫", "아이스크림": "🍦", "사과": "🍎", "딸기": "🍓", "포도": "🍇",
    "수박": "🍉", "레몬": "🍋", "바나나": "🍌", "복숭아": "🍑", "체리": "🍒",
    "와인": "🍷", "맥주": "🍺", "차": "🍵", "우유": "🥛", "꿀": "🍯", "소금": "🧂",
    # 사물
    "책": "📖", "편지": "✉", "우표": "📮", "전화": "📞", "휴대폰": "📱",
    "컴퓨터": "💻", "티비": "📺", "라디오": "📻", "필름": "🎬", "그림": "🖼",
    "붓": "🖌", "열쇠": "🔑", "자물쇠": "🔒", "문": "🚪", "창문": "🪟",
    "침대": "🛏", "의자": "🪑", "거울": "🪞", "우산": "☂", "칼": "🔪",
    "총": "🔫", "폭탄": "💣", "방패": "🛡", "검": "⚔", "왕관": "👑",
    "반지": "💍", "보석": "💎", "풍선": "🎈", "리본": "🎀", "인형": "🧸",
    "주사위": "🎲", "카드": "🃏", "퍼즐": "🧩", "실": "🧵", "바늘": "📌",
    "모래시계": "⏳", "종": "🔔", "깃발": "🚩", "지팡이": "🪄", "망원경": "🔭",
    "돋보기": "🔍", "저울": "⚖", "약": "💊", "주사": "💉", "체온": "🌡",
    # 탈것·장소
    "자동차": "🚗", "택시": "🚕", "트럭": "🚚", "오토바이": "🏍", "비행기": "✈",
    "헬기": "🚁", "우주선": "🚀", "요트": "🛥", "썰매": "🛷", "관람차": "🎡",
    "회전목마": "🎠", "텐트": "⛺", "집": "🏠", "성": "🏰", "탑": "🗼",
    "등대": "🗼", "공장": "🏭", "가게": "🏪", "무대": "🎪", "길": "🛣",
    # 활동·기호
    "축구": "⚽", "야구": "⚾", "농구": "🏀", "게임": "🎮", "달리기": "🏃",
    "수영": "🏊", "자전거타": "🚴", "등산": "🧗", "낚시": "🎣", "요리": "🍳",
    "공부": "📚", "일": "💼", "쇼핑": "🛍", "청소": "🧹", "목욕": "🛁",
    "메달": "🏅", "별표": "🌟", "느낌표": "❗", "물음표": "❓", "체크": "✅",
    "금지": "🚫", "경고": "⚠", "무한": "♾", "음표": "🎵", "재생": "▶",
    # English (동일 개념)
    "dog": "🐶", "cat": "🐱", "rabbit": "🐰", "bear": "🐻", "fox": "🦊",
    "wolf": "🐺", "lion": "🦁", "tiger": "🐯", "horse": "🐴", "bird": "🐦",
    "fish": "🐟", "whale": "🐳", "shark": "🦈", "turtle": "🐢", "snake": "🐍",
    "frog": "🐸", "butterfly": "🦋", "bee": "🐝", "dragon": "🐉", "unicorn": "🦄",
    "hand": "✋", "eye": "👁", "heart": "❤", "brain": "🧠", "baby": "👶",
    "king": "🤴", "queen": "👸", "hero": "🦸", "ghost": "👻", "robot": "🤖",
    "alien": "👽", "love": "❤", "tears": "😭", "smile": "🙂", "dream": "💤",
    "promise": "🤝", "sun": "☀", "moon": "🌙", "star": "⭐", "galaxy": "🌌",
    "earth": "🌍", "planet": "🪐", "rain": "🌧", "snow": "❄", "thunder": "⚡",
    "wind": "🌬", "fire": "🔥", "water": "💧", "wave": "🌊", "ocean": "🌊",
    "sea": "🌊", "mountain": "⛰", "tree": "🌳", "forest": "🌲", "flower": "🌸",
    "rose": "🌹", "cactus": "🌵", "bread": "🍞", "pizza": "🍕", "apple": "🍎",
    "strawberry": "🍓", "lemon": "🍋", "wine": "🍷", "beer": "🍺", "honey": "🍯",
    "book": "📖", "letter": "✉", "phone": "📱", "key": "🔑", "lock": "🔒",
    "door": "🚪", "mirror": "🪞", "umbrella": "☂", "knife": "🔪", "sword": "⚔",
    "crown": "👑", "ring": "💍", "diamond": "💎", "balloon": "🎈", "gift": "🎁",
    "car": "🚗", "plane": "✈", "ship": "⛵", "house": "🏠", "castle": "🏰",
    "tower": "🗼", "road": "🛣", "run": "🏃", "swim": "🏊", "game": "🎮",
    "music": "🎵", "dance": "💃", "sing": "🎤", "night": "🌙", "day": "☀",
    "light": "💡", "dark": "🌑", "time": "⏳", "money": "💰", "candle": "🕯",
})


STOPWORDS = set("""그 이 저 나 너 우리 그리고 하지만 그냥 다시 아직 이제 너무 정말 매우
the a an and or but of to in on at is are was were be been i you we they it my your
oh yeah la na hey woo ah""".split())


KO_PARTICLES = re.compile(
    r"(은|는|이|가|을|를|에서|에게|에|의|도|만|과|와|으로|로|처럼|보다|까지|부터|야|아)$")


def _match_concrete(low):
    """가사에 '실제로 등장하는 사물 이름'을 모두 모아 가장 구체적인(긴) 것을 고른다.
    추상어(떠나·시간·우리…)보다 구체 명사(기차·기타·가족…)를 항상 우선한다."""
    best_score, best = -1, None
    for keys, icon in WORD_ICONS:
        for k in keys:
            if k in low:
                sc = len(k) * 10
                if sc > best_score:
                    best_score, best = sc, {"icon": icon, "word": k}
    for key, emo in WORD_EMOJI.items():
        kl = key.lower()
        if kl in low:
            sc = len(kl) * 10 + 5          # 같은 길이면 구체 명사(이모지) 우선
            if sc > best_score:
                best_score, best = sc, {"icon": None, "emoji": emo, "word": key}
    return best


def pick_word_shape(line, slot=0, context=""):
    """가사 한 줄에서 형상을 고른다. 순서대로:
    ① 같은 줄의 구체 명사 → ② 같은 줄의 감정어 → ③ 앞뒤 가사(문맥)의 구체 명사
    → ④ 가사에 실제로 있는 낱말을 글자 형상으로.
    가사와 무관한 아이콘은 쓰지 않는다(가사에 아무 낱말도 없을 때만 예외)."""
    low = line.lower()
    best = _match_concrete(low)
    if best:
        return best

    for keys, icon in ABSTRACT_ICONS:
        for k in keys:
            if k in low:
                return {"icon": icon, "word": k}

    if context:
        b2 = _match_concrete(context.lower())
        if b2:
            return b2

    words = [w.strip(".,!?~\"'()[]…") for w in re.split(r"[\s,./]+", line) if w.strip()]
    words = [w for w in words if w.lower() not in STOPWORDS and len(w) >= 2]
    if words:
        word = sorted(words, key=len, reverse=True)[0]
        stem = KO_PARTICLES.sub("", word)          # 조사를 떼어 낱말만 남긴다
        word = (stem if len(stem) >= 2 else word)[:6]
        # 조사를 뗀 형태로 다시 한 번 사전을 찾아본다 ("바람이" → "바람")
        b3 = _match_concrete(word.lower())
        if b3:
            return b3
        return {"icon": None, "word": word}
    return {"icon": FALLBACK_ICONS[slot % len(FALLBACK_ICONS)], "word": ""}


async def api_lyrics_shapes(request):
    """가사 → 구간별 형상 타임라인 (완전 로컬 사전 방식)"""
    data = await request.json()
    text = str(data.get("lyrics") or "")
    duration = max(1.0, float(data.get("duration") or 60))
    step = max(1.0, min(120.0, float(data.get("step") or 10)))   # 사용자가 초를 직접 입력

    # 인식된 구간(시간+가사)이 오면 그 시간을 그대로 쓴다
    segs = data.get("segments")
    timeline = []
    if isinstance(segs, list) and segs:
        # 전환 주기(step)마다 슬롯을 만들고, 그 시각에 '실제로 불리는' 가사를 찾아 매핑한다
        n_slots = max(1, int(duration // step) + (1 if duration % step > 0.5 else 0))
        for i in range(n_slots):
            t = round(i * step, 2)
            line, src = "", None
            # 1) 이 구간(t ~ t+step)에서 '앞으로 불릴' 가사를 먼저 쓴다.
            #    예: 전환 주기 10초면 10초 지점에는 10초부터 나오는 가사가 나온다.
            nxt = sorted([s for s in segs if t <= float(s.get("start", 0)) < t + step],
                         key=lambda s: float(s.get("start", 0)))
            if nxt:
                line, src = str(nxt[0].get("text") or "").strip(), nxt[0]
            # 2) 이 구간에 새로 시작하는 가사가 없으면 지금 불리고 있는 가사
            if not line:
                for s in segs:
                    if float(s.get("start", 0)) <= t <= float(s.get("end", 0)):
                        line, src = str(s.get("text") or "").strip(), s
                        break
            # 3) 그래도 없으면 직전 가사를 이어서 표시
            if not line:
                prev = [s for s in segs if float(s.get("start", 0)) <= t]
                if prev:
                    line, src = str(prev[-1].get("text") or "").strip(), prev[-1]
            # 같은 줄에 사물 이름이 없으면 이 구간(t ~ t+step)에 불리는 다른 줄에서 찾는다
            ctx = " ".join(str(s.get("text") or "") for s in segs
                           if t <= float(s.get("start", 0)) < t + step) or line
            pick = pick_word_shape(line, i, ctx) if line else {
                "icon": FALLBACK_ICONS[i % len(FALLBACK_ICONS)], "word": ""}
            timeline.append({"time": t, "lyric": line,
                             "lyric_start": round(float(src.get("start", 0)), 2) if src else None,
                             "icon": pick["icon"], "word": pick["word"],
                             "emoji": pick.get("emoji")})
    else:
        lines = [l.strip() for l in text.splitlines() if l.strip()]
        n_slots = max(1, int(duration // step) + (1 if duration % step > 1 else 0))
        for i in range(n_slots):
            j = i * len(lines) // n_slots if lines else 0
            line = lines[j] if lines else ""
            ctx = " ".join(lines[j:j + 2]) if lines else ""
            pick = pick_word_shape(line, i, ctx) if line else {
                "icon": FALLBACK_ICONS[i % len(FALLBACK_ICONS)], "word": ""}
            timeline.append({"time": round(i * step, 2), "lyric": line,
                             "icon": pick["icon"], "word": pick["word"],
                             "emoji": pick.get("emoji")})
    return web.json_response({"timeline": timeline})


def register(app):
    app.router.add_post("/api/transcribe", api_transcribe)
    app.router.add_post("/api/lyrics_shapes", api_lyrics_shapes)
