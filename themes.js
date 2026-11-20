// 情境主題：每個情境的島主（動物）、叫聲與介面配色
// hosts 依分類對應：[動物代號, 2D 表情符號, 中文名, 叫聲]
window.LISP_THEMES = (() => {
  const CATS = ["圖塊/屬性", "繪圖", "標註", "面積/數量統計", "修改", "文字", "圖層", "系統/授權",
    "圖面管理", "剖面/結構", "出圖/列印", "轉檔/匯出入", "對齊/排列", "查詢", "其他", "3D"];
  const map = (rows) => Object.fromEntries(CATS.map((c, i) => [c, { id: rows[i][0], emoji: rows[i][1], name: rows[i][2], sound: rows[i][3] }]));

  return {
    order: ["ghibli", "jungle", "ocean", "zoo", "safari"],
    themes: {
      ghibli: {
        label: "手繪群島", emoji: "🏝️", place: "島",
        ui: { accent: "#d1495b", leaf: "#5a8f3a", bar: "#fdf8ec", line: "#e8dcc4" },
        hosts: null,   // 使用原本的職人
      },
      jungle: {
        label: "叢林冒險", emoji: "🌴", place: "營地",
        ui: { accent: "#e76f51", leaf: "#2d6a4f", bar: "#eef3e2", line: "#c9d8b6" },
        hosts: map([
          ["gorilla", "🦍", "大猩猩", "吼吼！"], ["parrot", "🦜", "金剛鸚鵡", "嘎嘎！"], ["toucan", "🐦", "巨嘴鳥", "咕嚕！"],
          ["sloth", "🦥", "樹懶", "慢～慢～"], ["monkey", "🐒", "猴子", "嘰嘰！"], ["chameleon", "🦎", "變色龍", "咻～"],
          ["frog", "🐸", "樹蛙", "呱呱！"], ["jaguar", "🐆", "美洲豹", "嗷～"], ["orangutan", "🦧", "紅毛猩猩", "喔喔！"],
          ["croc", "🐊", "鱷魚", "啪啪！"], ["python", "🐍", "蟒蛇", "嘶嘶～"], ["elephant", "🐘", "亞洲象", "噗～"],
          ["lemur", "🐒", "狐猴", "咿咿！"], ["tiger", "🐅", "老虎", "吼～"], ["capybara", "🦫", "水豚", "咕～"],
          ["hornbill", "🐦", "犀鳥", "咚咚！"],
        ]),
      },
      ocean: {
        label: "海洋公園", emoji: "🐬", place: "海灣",
        ui: { accent: "#0077b6", leaf: "#0096c7", bar: "#eef8fb", line: "#bfe3ee" },
        hosts: map([
          ["turtle", "🐢", "海龜", "咕嚕咕嚕！"], ["dolphin", "🐬", "海豚", "咿～咿～"], ["penguin", "🐧", "企鵝", "啪噠啪噠！"],
          ["whale", "🐋", "鯨魚", "噗哇～"], ["crab", "🦀", "螃蟹", "喀喀！"], ["octopus", "🐙", "章魚", "噗嚕！"],
          ["sealion", "🦭", "海獅", "嗷嗷！"], ["shark", "🦈", "鯊魚", "嘿！"], ["seagull", "🐦", "海鷗", "啾啾！"],
          ["walrus", "🦭", "海象", "呼～"], ["clownfish", "🐠", "小丑魚", "啵啵！"], ["otter", "🦦", "水獺", "嘻嘻！"],
          ["starfish", "⭐", "海星", "閃閃！"], ["pelican", "🐦", "鵜鶘", "嘎！"], ["orca", "🐳", "虎鯨", "嘿呦！"],
          ["jellyfish", "🪼", "水母", "飄～"],
        ]),
      },
      zoo: {
        label: "野生動物園", emoji: "🦒", place: "園區",
        ui: { accent: "#f77f00", leaf: "#588157", bar: "#fbf6e6", line: "#e9dcb8" },
        hosts: map([
          ["elephant", "🐘", "大象", "噗噗！"], ["giraffe", "🦒", "長頸鹿", "嗯～"], ["panda", "🐼", "熊貓", "嚼嚼～"],
          ["hippo", "🦛", "河馬", "哇～"], ["kangaroo", "🦘", "袋鼠", "蹦蹦！"], ["koala", "🐨", "無尾熊", "呼嚕～"],
          ["flamingo", "🦩", "紅鶴", "嘎～"], ["lion", "🦁", "獅子", "吼～"], ["camel", "🐫", "駱駝", "咕～"],
          ["polarbear", "🐻‍❄️", "北極熊", "嗚～"], ["peacock", "🦚", "孔雀", "喔喔！"], ["zebra", "🦓", "斑馬", "嘶～"],
          ["penguin", "🐧", "企鵝", "啪噠！"], ["owl", "🦉", "貓頭鷹", "咕咕！"], ["redpanda", "🦝", "小熊貓", "嘰～"],
          ["tiger", "🐅", "老虎", "嗷～"],
        ]),
      },
      safari: {
        label: "非洲野生動物公園", emoji: "🦁", place: "營區",
        ui: { accent: "#bc4b1e", leaf: "#7f5539", bar: "#fbf1de", line: "#ead2a8" },
        hosts: map([
          ["elephant", "🐘", "非洲象", "噗～"], ["giraffe", "🦒", "長頸鹿", "嗯～"], ["zebra", "🦓", "斑馬", "嘶嘶！"],
          ["hippo", "🦛", "河馬", "哇～"], ["rhino", "🦏", "犀牛", "哼！"], ["cheetah", "🐆", "獵豹", "咻～"],
          ["meerkat", "🐿️", "狐獴", "嘰！"], ["lion", "🦁", "獅子", "吼～"], ["ostrich", "🐦", "鴕鳥", "咯咯！"],
          ["buffalo", "🐃", "非洲水牛", "哞～"], ["warthog", "🐗", "疣豬", "呼嚕！"], ["wildebeest", "🐃", "牛羚", "哞～"],
          ["flamingo", "🦩", "紅鶴", "嘎～"], ["hyena", "🐺", "鬣狗", "嘿嘿！"], ["leopard", "🐆", "花豹", "嗷～"],
          ["chimp", "🐒", "黑猩猩", "嗚嗚！"],
        ]),
      },
    },
  };
})();
