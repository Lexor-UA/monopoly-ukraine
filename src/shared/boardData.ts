import {
  BoardCell,
  GameMode,
  PropertyState,
  SectorId,
  TeamId,
  TokenDefinition,
  TokenId,
} from './types';

export const MAX_GAME_PLAYERS = 4;

export const TEAM_META: Record<
  TeamId,
  {
    id: TeamId;
    name: string;
    shortName: string;
    badge: string;
    color: string;
  }
> = {
  A: {
    id: 'A',
    name: 'Синій Альянс',
    shortName: 'Команда А',
    badge: 'АЛЬЯНС А',
    color: '#38BDF8',
  },
  B: {
    id: 'B',
    name: 'Золотий Альянс',
    shortName: 'Команда Б',
    badge: 'АЛЬЯНС Б',
    color: '#FBBF24',
  },
};

export function areTeammates(
  gameMode: GameMode | undefined,
  p1?: { id: string; teamId?: TeamId } | null,
  p2?: { id: string; teamId?: TeamId } | null
): boolean {
  if (gameMode !== 'team2v2' || !p1 || !p2) return false;
  if (p1.id === p2.id) return false;
  return Boolean(p1.teamId && p1.teamId === p2.teamId);
}

export const SECTOR_COLORS: Record<SectorId, string> = {
  coffee: '#C86D2D', // Насичений карамельно-кавовий (2 компанії)
  retail: '#06B6D4', // Яскравий бірюзово-ціановий (3 компанії)
  delivery: '#EC4899', // Насичений маджентово-рожевий (3 компанії)
  fuel: '#F97316', // Вогняно-помаранчевий (3 компанії)
  ecommerce: '#EF4444', // Чистий рубіново-червоний (3 компанії)
  telecom: '#FACC15', // Сонячно-жовтий (3 компанії)
  tech: '#22C55E', // Смарагдово-зелений (3 компанії)
  fintech: '#8B5CF6', // Королівський аметистово-фіолетовий (2 компанії)
  transport: '#CBD5E1', // Полірований платиново-срібний металік (4 транспортні хаби — спецмережа)
  utility: '#E7E5E4', // Перлинно-титановий металік (2 об'єкти інфраструктури — спецмережа)
};

export const SECTOR_BOARD_BADGE_LABELS: Record<SectorId, string> = {
  coffee: 'Кав’ярні',
  retail: 'Магазини',
  delivery: 'Пошта',
  fuel: 'Пальне',
  ecommerce: 'Торгівля',
  telecom: 'Зв’язок',
  tech: 'ІТ',
  fintech: 'Банки',
  transport: 'Транспорт',
  utility: 'Інфраструктура',
};

export const TOKENS: TokenDefinition[] = [
  {
    id: 'tryzub',
    name: 'Золотий Тризуб',
    title: 'Символ волі та державності',
    defaultColor: '#2563EB',
  },
  {
    id: 'patron',
    name: 'Галицький Лев',
    title: 'Шляхетний символ сили й капіталу',
    defaultColor: '#F59E0B',
  },
  {
    id: 'mriya',
    name: 'Крила Свободи',
    title: 'Флагман українського неба',
    defaultColor: '#0EA5E9',
  },
  {
    id: 'kozak',
    name: 'Козацька Шабля',
    title: 'Незламний характер і честь',
    defaultColor: '#E11D48',
  },
  {
    id: 'kashtan',
    name: 'Київський Каштан',
    title: 'Серце квітучої столиці',
    defaultColor: '#10B981',
  },
  {
    id: 'bulava',
    name: 'Гетьманська Булава',
    title: 'Знак вищої бізнес-влади',
    defaultColor: '#8B5CF6',
  },
  {
    id: 'kotyk',
    name: 'Котик',
    title: 'Пухнастий талісман удачі',
    defaultColor: '#14B8A6',
  },
  {
    id: 'paddington',
    name: 'Ведмедик Паддінгтон',
    title: 'Джентльмен із валізою та мармеладом',
    defaultColor: '#F97316',
  },
  {
    id: 'potter',
    name: 'Гаррі Поттер',
    title: 'Чародій бізнесу та магії',
    defaultColor: '#D946EF',
  },
  {
    id: 'mickey',
    name: 'Міккі Маус',
    title: 'Легендарний символ оптимізму',
    defaultColor: '#EF4444',
  },
];

export const QUICK_REACTIONS = [
  '🇺🇦 Слава Україні!',
  '⚡ Героям Слава!',
  '🦁 Оце справжній магнат!',
  '🤝 Го в Смарт-Угоду?',
  '🎲 Кидай дубль!',
  '🛡️ Все на Оборону!',
  '💳 Кешбек прийшов!',
  '🔥 Оце гарячі торги!',
];

export const BOT_PROFILES: {
  name: string;
  token: TokenId;
  personality: string;
}[] = [
  {
    name: 'Пан Лев (AI)',
    token: 'patron',
    personality: 'Полює на фінтех і банківський сектор',
  },
  {
    name: 'Леся (AI)',
    token: 'kashtan',
    personality: 'Стратегічно об’єднує сектори та будує філії',
  },
  {
    name: 'Тарас (AI)',
    token: 'kozak',
    personality: 'Сміливо торгується на живих аукціонах',
  },
  {
    name: 'Богдан (AI)',
    token: 'bulava',
    personality: 'Контролює транспорт і логістику',
  },
  {
    name: 'Софія (AI)',
    token: 'mriya',
    personality: 'Інвестує в український ІТ та енергетику',
  },
];

export const BOARD_CELLS: BoardCell[] = [
  // === TOP ROW (0..10) ===
  {
    index: 0,
    name: 'СТАРТ • Майдан Свободи',
    shortName: 'СТАРТ',
    subtitle: '+2 000 ₴ за коло',
    type: 'start',
    brandKey: 'start',
    color: '#2563EB',
    description:
      'Початок фінансового кола. Кожне проходження або зупинка приносить +2 000 ₴ підтримки на розвиток бізнесу.',
  },
  {
    index: 1,
    name: 'Галицька Пекарня',
    shortName: 'Пекарня',
    type: 'company',
    sector: 'coffee',
    sectorName: 'Кав’ярні та Пекарні',
    color: SECTOR_COLORS.coffee,
    brandKey: 'bakery',
    price: 600,
    branchCost: 500,
    rent: [40, 200, 600, 1800, 3200, 4500],
    description:
      'Всеукраїнська мережа ремісничих пекарень зі Львова, що підкорила міста ароматною випічкою з печі.',
  },
  {
    index: 2,
    name: 'Цифровий Пуш',
    shortName: 'Пуш UA',
    subtitle: 'Подія',
    type: 'event_diia',
    brandKey: 'gov_push',
    description:
      'Миттєве електронне сповіщення: гранти «Власна Справа», національний кешбек або податковий аудит.',
  },
  {
    index: 3,
    name: 'Кава Подолу',
    shortName: 'Поділ',
    type: 'company',
    sector: 'coffee',
    sectorName: 'Кав’ярні та Пекарні',
    color: SECTOR_COLORS.coffee,
    brandKey: 'podil_kava',
    price: 600,
    branchCost: 500,
    rent: [60, 300, 900, 2700, 4000, 5500],
    description:
      'Культова київська мережа спешелті-кав’ярень to-go, що заряджає ранковою енергією десятки міст країни.',
  },
  {
    index: 4,
    name: 'Внесок на Оборону',
    shortName: 'Оборона',
    subtitle: '-2 000 ₴',
    type: 'tax',
    brandKey: 'defense_fund',
    taxAmount: 2000,
    description:
      'Почесний обов’язок українського бізнесу — підтримати Сили Оборони України внеском 2 000 ₴.',
  },
  {
    index: 5,
    name: 'Залізний Експрес',
    shortName: 'Експрес',
    type: 'transport',
    sector: 'transport',
    sectorName: 'Стратегічний Транспорт',
    color: SECTOR_COLORS.transport,
    brandKey: 'rail_express',
    price: 2000,
    rent: [250, 500, 1000, 2000],
    description:
      'Швидкісні залізничні магістралі України! Потяги за розкладом у будь-яку погоду. Дохід зростає за кожен транспортний хаб.',
  },
  {
    index: 6,
    name: 'Маркет 24/7',
    shortName: 'Маркет 24',
    type: 'company',
    sector: 'retail',
    sectorName: 'Магазини та Супермаркети',
    color: SECTOR_COLORS.retail,
    brandKey: 'market24',
    price: 1000,
    branchCost: 500,
    rent: [80, 400, 1000, 3000, 4500, 6000],
    description:
      'Народна мережа супермаркетів у кожному районі країни з автономною логістикою та мільйонами покупців щодня.',
  },
  {
    index: 7,
    name: 'Фонд Єдності',
    shortName: 'Єдність',
    subtitle: 'Шанс та події',
    type: 'event_unity',
    brandKey: 'unity_fund',
    description:
      'Картка всеукраїнської взаємопідтримки, волонтерських мегазборів та несподіваних поворотів ринку.',
  },
  {
    index: 8,
    name: 'Сяйво Мультимаркет',
    shortName: 'Сяйво',
    type: 'company',
    sector: 'retail',
    sectorName: 'Магазини та Супермаркети',
    color: SECTOR_COLORS.retail,
    brandKey: 'syaivo',
    price: 1000,
    branchCost: 500,
    rent: [80, 400, 1000, 3000, 4500, 6000],
    description:
      'Динамічний український мультимаркет корисних товарів для дому з сотнями нових магазинів щороку.',
  },
  {
    index: 9,
    name: 'Лавка Смаку',
    shortName: 'Лавка',
    type: 'company',
    sector: 'retail',
    sectorName: 'Магазини та Супермаркети',
    color: SECTOR_COLORS.retail,
    brandKey: 'lavka_smaku',
    price: 1200,
    branchCost: 500,
    rent: [100, 500, 1250, 3600, 5000, 6500],
    description:
      'Дизайнерські гастромаркети вражень, крафтові продукти від українських фермерів та власна пекарня.',
  },

  // === RIGHT COLUMN (10..20) ===
  {
    index: 10,
    name: 'Санкційний Ізолятор',
    shortName: 'Ізолятор',
    subtitle: 'Візит • Нагляд',
    type: 'jail',
    brandKey: 'jail',
    color: '#64748B',
    description:
      'Якщо ви просто з візитом — хвилюватися нічого. Якщо активи заморожено — вийдіть за дубль, імунітет або заставу 500 ₴.',
  },
  {
    index: 11,
    name: 'Козацька Пошта',
    shortName: 'Козацька',
    type: 'company',
    sector: 'delivery',
    sectorName: 'Пошта та Доставка',
    color: SECTOR_COLORS.delivery,
    brandKey: 'kozak_post',
    price: 1400,
    branchCost: 1000,
    rent: [120, 600, 1600, 4600, 6250, 7500],
    description:
      'Національна поштова мережа та автор легендарних колекційних марок, що дістається найвіддаленіших громад.',
  },
  {
    index: 12,
    name: 'Цифрова Хмара UA',
    shortName: 'Хмара UA',
    type: 'utility',
    sector: 'utility',
    sectorName: 'Критична Інфраструктура',
    color: SECTOR_COLORS.utility,
    brandKey: 'gov_cloud',
    price: 1500,
    description:
      'Національна хмарна екосистема електронних реєстрів та цифрових підписів. Оренда ×40 від суми кубиків (або ×100 разом з Енерго Мережею UA!).',
  },
  {
    index: 13,
    name: 'Міст Експрес',
    shortName: 'Міст',
    type: 'company',
    sector: 'delivery',
    sectorName: 'Пошта та Доставка',
    color: SECTOR_COLORS.delivery,
    brandKey: 'mist_express',
    price: 1400,
    branchCost: 1000,
    rent: [120, 600, 1600, 4600, 6250, 7500],
    description:
      'Міжнародний логістичний міст, що з’єднує українських підприємців із клієнтами в Європі та Північній Америці.',
  },
  {
    index: 14,
    name: 'Блискавка Пошта',
    shortName: 'Блискавка',
    type: 'company',
    sector: 'delivery',
    sectorName: 'Пошта та Доставка',
    color: SECTOR_COLORS.delivery,
    brandKey: 'blyskavka',
    price: 1600,
    branchCost: 1000,
    rent: [140, 700, 1900, 5200, 7000, 9000],
    description:
      'Надшвидка експрес-доставка майбутнього: роботизовані термінали та тисячі поштоматів біля кожного під’їзду!',
  },
  {
    index: 15,
    name: 'Стріла Таксі',
    shortName: 'Стріла',
    type: 'transport',
    sector: 'transport',
    sectorName: 'Стратегічний Транспорт',
    color: SECTOR_COLORS.transport,
    brandKey: 'strila_taxi',
    price: 2000,
    rent: [250, 500, 1000, 2000],
    description:
      'Український продуктовий ІТ-сервіс замовлення авто та експрес-кур’єрів, що рухає мегаполіси 24/7.',
  },
  {
    index: 16,
    name: 'Нафта Карпат',
    shortName: 'Нафта UA',
    type: 'company',
    sector: 'fuel',
    sectorName: 'Пальне та Заправки',
    color: SECTOR_COLORS.fuel,
    brandKey: 'nafta_karpat',
    price: 1800,
    branchCost: 1000,
    rent: [160, 800, 2200, 6000, 8000, 9600],
    description:
      'Провідна видобувна компанія та модернізована мережа автозаправних станцій на ключових автошляхах.',
  },
  {
    index: 17,
    name: 'Цифровий Пуш',
    shortName: 'Пуш UA',
    subtitle: 'Подія',
    type: 'event_diia',
    brandKey: 'gov_push',
    description:
      'Миттєве електронне сповіщення: програми розвитку бізнесу, кешбек або регуляторні зміни.',
  },
  {
    index: 18,
    name: 'Мустанг Ойл',
    shortName: 'Мустанг',
    type: 'company',
    sector: 'fuel',
    sectorName: 'Пальне та Заправки',
    color: SECTOR_COLORS.fuel,
    brandKey: 'mustang_oil',
    price: 1800,
    branchCost: 1000,
    rent: [160, 800, 2200, 6000, 8000, 9600],
    description:
      'Сучасні автозаправні комплекси зі швидкісними електрочарджерами та найкавовішою атмосферою на трасах.',
  },
  {
    index: 19,
    name: 'Пульс АЗК',
    shortName: 'Пульс АЗК',
    type: 'company',
    sector: 'fuel',
    sectorName: 'Пальне та Заправки',
    color: SECTOR_COLORS.fuel,
    brandKey: 'puls_azk',
    price: 2000,
    branchCost: 1000,
    rent: [180, 900, 2500, 7000, 8800, 10500],
    description:
      'Флагман преміальних автозаправних комплексів України з масштабними благодійними проєктами для оборони.',
  },

  // === BOTTOM ROW (20..30) ===
  {
    index: 20,
    name: 'Карпатський Курорт',
    shortName: 'Карпати',
    subtitle: 'Гірський ретрит',
    type: 'karpaty',
    brandKey: 'karpaty',
    color: '#10B981',
    description:
      'Кришталеве гірське повітря українських Карпат! Відпочиньте від бізнес-баталій та заберіть накопичений регіональний грант.',
  },
  {
    index: 21,
    name: 'Ярмарок UA',
    shortName: 'Ярмарок',
    type: 'company',
    sector: 'ecommerce',
    sectorName: 'Торгівля та Гіпермаркети',
    color: SECTOR_COLORS.ecommerce,
    brandKey: 'yarmarok',
    price: 2200,
    branchCost: 1500,
    rent: [200, 1000, 2800, 7500, 9250, 11000],
    description:
      'Всеукраїнський онлайн-маркетплейс для десятків тисяч локальних підприємців, майстрів і виробників.',
  },
  {
    index: 22,
    name: 'Фонд Єдності',
    shortName: 'Єдність',
    subtitle: 'Шанс та події',
    type: 'event_unity',
    brandKey: 'unity_fund',
    description:
      'Картка всеукраїнської взаємопідтримки, міжнародних інвестицій та ринкових можливостей.',
  },
  {
    index: 23,
    name: 'Мега Буд',
    shortName: 'Мега Буд',
    type: 'company',
    sector: 'ecommerce',
    sectorName: 'Торгівля та Гіпермаркети',
    color: SECTOR_COLORS.ecommerce,
    brandKey: 'megabud',
    price: 2200,
    branchCost: 1500,
    rent: [200, 1000, 2800, 7500, 9250, 11000],
    description:
      'Гігантські торговельні комплекси матеріалів для будівництва, затишку та великої відбудови українських міст.',
  },
  {
    index: 24,
    name: 'Кошик UA',
    shortName: 'Кошик UA',
    type: 'company',
    sector: 'ecommerce',
    sectorName: 'Торгівля та Гіпермаркети',
    color: SECTOR_COLORS.ecommerce,
    brandKey: 'koshyk',
    price: 2400,
    branchCost: 1500,
    rent: [220, 1100, 3200, 8200, 10000, 12000],
    description:
      'Головний інтернет-супермаркет електроніки й мільйонів товарів із миттєвою видачею у кожному місті!',
  },
  {
    index: 25,
    name: 'Чорноморський Порт',
    shortName: 'Морпорт',
    type: 'transport',
    sector: 'transport',
    sectorName: 'Стратегічний Транспорт',
    color: SECTOR_COLORS.transport,
    brandKey: 'sea_port',
    price: 2000,
    rent: [250, 500, 1000, 2000],
    description:
      'Морські ворота України та стратегічний зерновий коридор, що забезпечує експорт на всі континенти.',
  },
  {
    index: 26,
    name: 'Хвиля Мобайл',
    shortName: 'Хвиля',
    type: 'company',
    sector: 'telecom',
    sectorName: 'Зв’язок та Інтернет',
    color: SECTOR_COLORS.telecom,
    brandKey: 'khvylia',
    price: 2600,
    branchCost: 1500,
    rent: [240, 1200, 3500, 8600, 10500, 12500],
    description:
      'Швидкісний мобільний інтернет, європейський роумінг та енергонезалежні базові станції зв’язку.',
  },
  {
    index: 27,
    name: 'Лайф Пульс',
    shortName: 'Лайф',
    type: 'company',
    sector: 'telecom',
    sectorName: 'Зв’язок та Інтернет',
    color: SECTOR_COLORS.telecom,
    brandKey: 'lifepuls',
    price: 2600,
    branchCost: 1500,
    rent: [240, 1200, 3500, 8600, 10500, 12500],
    description:
      'Динамічний діджитал-оператор для молоді, ІТ-спеціалістів, стрімерів та сучасного бізнесу.',
  },
  {
    index: 28,
    name: 'Енерго Мережа UA',
    shortName: 'Енерго',
    type: 'utility',
    sector: 'utility',
    sectorName: 'Критична Інфраструктура',
    color: SECTOR_COLORS.utility,
    brandKey: 'energo_grid',
    price: 1500,
    description:
      'Титани українського світла, інтегровані з енергосистемою Європи. Оренда ×40 (або ×100 разом із Цифровою Хмарою UA) від суми кубиків.',
  },
  {
    index: 29,
    name: 'Зірка Телеком',
    shortName: 'Зірка',
    type: 'company',
    sector: 'telecom',
    sectorName: 'Зв’язок та Інтернет',
    color: SECTOR_COLORS.telecom,
    brandKey: 'zirka_telecom',
    price: 2800,
    branchCost: 1500,
    rent: [260, 1300, 3900, 9000, 11000, 13000],
    description:
      'Найбільший оператор електронних комунікацій країни: мобільне покриття, гігабітний інтернет та дата-центри.',
  },

  // === LEFT COLUMN (30..39) ===
  {
    index: 30,
    name: 'Антимонопольний Рейд',
    shortName: 'Спецрейд',
    subtitle: 'В ізолятор!',
    type: 'sbu',
    brandKey: 'raid',
    color: '#DC2626',
    description:
      'Фінансовий моніторинг викрив тіньові схеми! Негайно вирушайте в Санкційний Ізолятор без отримання 2 000 ₴ за Старт.',
  },
  {
    index: 31,
    name: 'Кібер Лапа',
    shortName: 'КіберЛапа',
    type: 'company',
    sector: 'tech',
    sectorName: 'ІТ та Технології',
    color: SECTOR_COLORS.tech,
    brandKey: 'cyberlapa',
    price: 3000,
    branchCost: 2000,
    rent: [280, 1400, 4200, 9500, 11500, 13500],
    description:
      'Київська продуктова ІТ-компанія, чиї флагманські утиліти оптимізують десятки мільйонів комп’ютерів у світі.',
  },
  {
    index: 32,
    name: 'Слово AI',
    shortName: 'Слово AI',
    type: 'company',
    sector: 'tech',
    sectorName: 'ІТ та Технології',
    color: SECTOR_COLORS.tech,
    brandKey: 'slovo_ai',
    price: 3000,
    branchCost: 2000,
    rent: [280, 1400, 4200, 9500, 11500, 13500],
    description:
      'Народжений у Києві AI-єдиноріг світового масштабу з розумними мовними асистентами для мільйонів людей.',
  },
  {
    index: 33,
    name: 'Цифровий Пуш',
    shortName: 'Пуш UA',
    subtitle: 'Подія',
    type: 'event_diia',
    brandKey: 'gov_push',
    description:
      'Миттєве електронне сповіщення: цифрові реформи, інвест-програми та бізнес-події.',
  },
  {
    index: 34,
    name: 'Оберіг Системс',
    shortName: 'Оберіг',
    type: 'company',
    sector: 'tech',
    sectorName: 'ІТ та Технології',
    color: SECTOR_COLORS.tech,
    brandKey: 'oberig',
    price: 3200,
    branchCost: 2000,
    rent: [320, 1600, 4700, 10500, 12500, 14500],
    description:
      'Інженерний лідер Європи з бездротових систем інтелектуальної безпеки та розумного захисту дому. Розроблено в Україні!',
  },
  {
    index: 35,
    name: 'Крила Карго',
    shortName: 'Крила',
    type: 'transport',
    sector: 'transport',
    sectorName: 'Стратегічний Транспорт',
    color: SECTOR_COLORS.transport,
    brandKey: 'kryla_cargo',
    price: 2000,
    rent: [250, 500, 1000, 2000],
    description:
      'Важка транспортна авіація України, здатна перевезти турбіни, локомотиви та супутники в будь-яку точку планети.',
  },
  {
    index: 36,
    name: 'Фонд Єдності',
    shortName: 'Єдність',
    subtitle: 'Шанс та події',
    type: 'event_unity',
    brandKey: 'unity_fund',
    description:
      'Картка всеукраїнської взаємопідтримки, волонтерських зборів та великого бізнесу.',
  },
  {
    index: 37,
    name: 'Народний Банк',
    shortName: 'Народний',
    type: 'company',
    sector: 'fintech',
    sectorName: 'Банки та Фінанси',
    color: SECTOR_COLORS.fintech,
    brandKey: 'narodnyi_bank',
    price: 3500,
    branchCost: 2000,
    rent: [380, 1850, 5200, 11500, 13500, 16000],
    description:
      'Системний банківський гігант країни з найбільшою мережею терміналів та миттєвим цифровим еквайрингом.',
  },
  {
    index: 38,
    name: 'Мегазбір на Дрони',
    shortName: 'Мегазбір',
    subtitle: '-1 000 ₴',
    type: 'tax',
    brandKey: 'megazbir',
    taxAmount: 1000,
    description:
      'Закриваємо великий всеукраїнський збір на розвідувальні безпілотники та засоби РЕБ! Ваш внесок — 1 000 ₴.',
  },
  {
    index: 39,
    name: 'Необанк Лев',
    shortName: 'Необанк',
    type: 'company',
    sector: 'fintech',
    sectorName: 'Банки та Фінанси',
    color: SECTOR_COLORS.fintech,
    brandKey: 'neobank_lev',
    price: 4000,
    branchCost: 2000,
    rent: [500, 2200, 6200, 14000, 17000, 20000],
    description:
      'Флагманський український мобільний необанк із Золотим Левом, миттєвим кешбеком, спільними скарбничками та найкращим UX у Європі!',
  },
];

export interface RawEventCard {
  id: string;
  deck: 'diia' | 'unity';
  badge: string;
  title: string;
  description: string;
  action:
    | { type: 'money'; amount: number; isZsu?: boolean }
    | { type: 'move_to'; targetIndex: number; passStartBonus: boolean }
    | { type: 'go_to_jail' }
    | { type: 'amnesty' }
    | { type: 'collect_from_each'; amount: number }
    | { type: 'repairs'; perBranch: number; perHolding: number };
}

export const DIIA_CARDS: RawEventCard[] = [
  {
    id: 'diia_1',
    deck: 'diia',
    badge: 'Грант • Власна Справа',
    title: 'Державний грант на масштабування бізнесу',
    description:
      'Вашу електронну заявку схвалено! Отримайте безповоротний грант на відкриття нових ліній виробництва.',
    action: { type: 'money', amount: 1500 },
  },
  {
    id: 'diia_2',
    deck: 'diia',
    badge: 'Національний Кешбек',
    title: 'Зроблено в Україні',
    description:
      'Ви підтримували українських виробників цілий місяць. Кешбек зараховано на вашу платинову картку!',
    action: { type: 'money', amount: 1000 },
  },
  {
    id: 'diia_3',
    deck: 'diia',
    badge: 'Облігації Перемоги',
    title: 'Виплата за облігаціями «Крим» та «Донецьк»',
    description:
      'Термін погашення державних облігацій настав: ви підтримали економіку та отримали чистий купонний дохід.',
    action: { type: 'money', amount: 1200 },
  },
  {
    id: 'diia_4',
    deck: 'diia',
    badge: 'Енергонезалежність',
    title: 'Автономне живлення офісів',
    description:
      'Час встановити сонячні панелі, промислові акумулятори та супутниковий інтернет: сплатіть 250 ₴ за кожну філію та 900 ₴ за кожен холдинг.',
    action: { type: 'repairs', perBranch: 250, perHolding: 900 },
  },
  {
    id: 'diia_5',
    deck: 'diia',
    badge: 'Імунітет Бізнесу',
    title: 'Сертифікат доброчесного платника податків',
    description:
      'Зберігається у вашому профілі та дозволяє безкоштовно зняти санкції й вийти з ізолятора в будь-який момент.',
    action: { type: 'amnesty' },
  },
  {
    id: 'diia_6',
    deck: 'diia',
    badge: 'Залізний Експрес',
    title: 'Дипломатичний спецрейс',
    description:
      'Вирушайте на центральний вокзал «Залізний Експрес». Якщо проходите Старт — отримайте +2 000 ₴.',
    action: { type: 'move_to', targetIndex: 5, passStartBonus: true },
  },
  {
    id: 'diia_7',
    deck: 'diia',
    badge: 'Фінмоніторинг',
    title: 'Підозрілі офшорні транзакції!',
    description:
      'Автоматичний моніторинг виявив спробу ухилення від податків. Негайно вирушайте в Санкційний Ізолятор!',
    action: { type: 'go_to_jail' },
  },
  {
    id: 'diia_8',
    deck: 'diia',
    badge: 'Фінтех Саміт',
    title: 'Зустріч інвесторів у Необанк Лев',
    description:
      'Вирушайте прямо до головної вежі «Необанк Лев». Якщо проходите Старт — отримайте +2 000 ₴.',
    action: { type: 'move_to', targetIndex: 39, passStartBonus: true },
  },
];

export const UNITY_CARDS: RawEventCard[] = [
  {
    id: 'unity_1',
    deck: 'unity',
    badge: 'Волонтерський Штаб',
    title: 'Терміновий внесок на захист неба та РЕБ',
    description:
      'Оборонці неба цієї ночі відпрацювали на відмінно! Ви з вдячністю донатите 600 ₴ на підсилення ППО.',
    action: { type: 'money', amount: -600, isZsu: true },
  },
  {
    id: 'unity_2',
    deck: 'unity',
    badge: 'День Незалежності 🇺🇦',
    title: 'Святковий бізнес-форум єдності',
    description:
      'Ви стали партнером року! Кожен активний гравець вітає вас та переказує по 250 ₴ у ваш інвест-фонд.',
    action: { type: 'collect_from_each', amount: 250 },
  },
  {
    id: 'unity_3',
    deck: 'unity',
    badge: 'Світова Діаспора',
    title: 'Венчурні інвестиції з Канади та ЄС',
    description:
      'Міжнародний інвестиційний фонд обрав ваш український стартап для глобального масштабування: +2 000 ₴!',
    action: { type: 'money', amount: 2000 },
  },
  {
    id: 'unity_4',
    deck: 'unity',
    badge: 'Відновлення Сил',
    title: 'Вікенд у українських Карпатах',
    description:
      'Вирушайте на клітинку «Карпатський Курорт». Якщо проходите Старт — отримайте +2 000 ₴.',
    action: { type: 'move_to', targetIndex: 20, passStartBonus: true },
  },
  {
    id: 'unity_5',
    deck: 'unity',
    badge: 'Експрес-Логістика',
    title: 'Відкриття роботизованого сортувального терміналу',
    description:
      'Перемістіться на клітинку «Блискавка Пошта». Якщо проходите Старт — отримайте +2 000 ₴.',
    action: { type: 'move_to', targetIndex: 14, passStartBonus: true },
  },
  {
    id: 'unity_6',
    deck: 'unity',
    badge: 'Ринковий Регулятор',
    title: 'Штраф за демпінг цін',
    description:
      'Антимонопольна комісія зобов’язала сплатити штраф у бюджет за агресивне поглинання конкурентів: -800 ₴.',
    action: { type: 'money', amount: -800 },
  },
  {
    id: 'unity_7',
    deck: 'unity',
    badge: 'Майдан Свободи',
    title: 'Новий фінансовий рік',
    description:
      'Поверніться просто на Старт та одразу отримайте державну виплату +2 000 ₴!',
    action: { type: 'move_to', targetIndex: 0, passStartBonus: true },
  },
  {
    id: 'unity_8',
    deck: 'unity',
    badge: 'Експортний Рекорд',
    title: 'Український морський коридор б’є рекорди',
    description:
      'Ваші експортні контракти принесли чистий валютний виторг: +800 ₴.',
    action: { type: 'money', amount: 800 },
  },
];

export function isPurchasableCell(cell: BoardCell): boolean {
  return (
    cell.type === 'company' ||
    cell.type === 'transport' ||
    cell.type === 'utility'
  );
}

export function getSectorCells(sector: SectorId): BoardCell[] {
  return BOARD_CELLS.filter((c) => c.sector === sector);
}

export function hasFullSectorMonopoly(
  ownerId: string,
  sector: SectorId,
  properties: Record<number, PropertyState>,
  requireUnmortgaged = true
): boolean {
  const sectorCells = getSectorCells(sector);
  if (sectorCells.length === 0) return false;
  return sectorCells.every((c) => {
    const prop = properties[c.index];
    if (!prop || prop.ownerId !== ownerId) return false;
    if (requireUnmortgaged && prop.isMortgaged) return false;
    return true;
  });
}

export function calculateRent(
  cellIndex: number,
  properties: Record<number, PropertyState>,
  diceSum: number
): number {
  const cell = BOARD_CELLS[cellIndex];
  const prop = properties[cellIndex];
  if (!cell || !prop || !prop.ownerId || prop.isMortgaged) return 0;

  if (cell.type === 'company' && cell.rent && cell.sector) {
    if (prop.branches > 0) {
      return cell.rent[Math.min(prop.branches, 5)];
    }
    const base = cell.rent[0];
    const isMonopoly = hasFullSectorMonopoly(
      prop.ownerId,
      cell.sector,
      properties,
      true
    );
    return isMonopoly ? base * 2 : base;
  }

  if (cell.type === 'transport' && cell.rent) {
    const ownedTransports = BOARD_CELLS.filter(
      (c) =>
        c.type === 'transport' &&
        properties[c.index]?.ownerId === prop.ownerId &&
        !properties[c.index]?.isMortgaged
    ).length;
    if (ownedTransports <= 0) return 0;
    return cell.rent[Math.min(ownedTransports - 1, 3)];
  }

  if (cell.type === 'utility') {
    const ownedUtilities = BOARD_CELLS.filter(
      (c) =>
        c.type === 'utility' &&
        properties[c.index]?.ownerId === prop.ownerId &&
        !properties[c.index]?.isMortgaged
    ).length;
    const multiplier = ownedUtilities >= 2 ? 100 : 40;
    return diceSum * multiplier;
  }

  return 0;
}

export function canBuildBranch(
  playerId: string,
  cellIndex: number,
  playerMoney: number,
  properties: Record<number, PropertyState>
): { ok: boolean; reason?: string } {
  const cell = BOARD_CELLS[cellIndex];
  const prop = properties[cellIndex];
  if (!cell || cell.type !== 'company' || !cell.sector || !cell.branchCost) {
    return { ok: false, reason: 'На цій клітинці не можна будувати філії' };
  }
  if (!prop || prop.ownerId !== playerId) {
    return { ok: false, reason: 'Ви не є власником цієї компанії' };
  }
  if (prop.isMortgaged) {
    return { ok: false, reason: 'Компанія перебуває у заставі' };
  }
  if (prop.branches >= 5) {
    return { ok: false, reason: 'Вже побудовано Головний Холдинг (максимум)' };
  }
  if (!hasFullSectorMonopoly(playerId, cell.sector, properties, true)) {
    return {
      ok: false,
      reason: 'Зберіть усі компанії цього сектору (без застави) для будівництва філій',
    };
  }
  if (playerMoney < cell.branchCost) {
    return {
      ok: false,
      reason: `Недостатньо коштів (потрібно ${formatMoney(cell.branchCost)})`,
    };
  }
  const sectorProps = getSectorCells(cell.sector).map((c) => properties[c.index]);
  const minBranches = Math.min(...sectorProps.map((p) => p?.branches ?? 0));
  if (prop.branches > minBranches) {
    return {
      ok: false,
      reason: 'Рівномірна забудова: спочатку побудуйте філії на інших компаніях сектору',
    };
  }
  return { ok: true };
}

export function canSellBranch(
  playerId: string,
  cellIndex: number,
  properties: Record<number, PropertyState>
): { ok: boolean; reason?: string } {
  const cell = BOARD_CELLS[cellIndex];
  const prop = properties[cellIndex];
  if (!cell || cell.type !== 'company' || !cell.sector || !cell.branchCost) {
    return { ok: false, reason: 'Неможливо продати філію' };
  }
  if (!prop || prop.ownerId !== playerId || prop.branches <= 0) {
    return { ok: false, reason: 'Немає побудованих філій' };
  }
  const sectorProps = getSectorCells(cell.sector).map((c) => properties[c.index]);
  const maxBranches = Math.max(...sectorProps.map((p) => p?.branches ?? 0));
  if (prop.branches < maxBranches) {
    return {
      ok: false,
      reason: 'Рівномірний продаж: спочатку продайте філію там, де їх найбільше в секторі',
    };
  }
  return { ok: true };
}

export function canMortgageProperty(
  playerId: string,
  cellIndex: number,
  properties: Record<number, PropertyState>
): { ok: boolean; reason?: string } {
  const cell = BOARD_CELLS[cellIndex];
  const prop = properties[cellIndex];
  if (!cell || !isPurchasableCell(cell) || !cell.price) {
    return { ok: false, reason: 'Об’єкт не підлягає заставі' };
  }
  if (!prop || prop.ownerId !== playerId) {
    return { ok: false, reason: 'Ви не володієте цією компанією' };
  }
  if (prop.isMortgaged) {
    return { ok: false, reason: 'Вже у заставі' };
  }
  if (cell.type === 'company' && cell.sector) {
    const sectorHasBranches = getSectorCells(cell.sector).some(
      (c) => (properties[c.index]?.branches ?? 0) > 0
    );
    if (sectorHasBranches) {
      return {
        ok: false,
        reason: 'Спочатку продайте філії в цьому секторі перед заставою',
      };
    }
  }
  return { ok: true };
}

export function getMortgageValue(cellIndex: number): number {
  const price = BOARD_CELLS[cellIndex]?.price ?? 0;
  return Math.floor(price * 0.5);
}

export function getUnmortgageCost(cellIndex: number): number {
  const price = BOARD_CELLS[cellIndex]?.price ?? 0;
  return Math.ceil(price * 0.55);
}

export function calculatePlayerNetWorth(
  playerId: string,
  money: number,
  properties: Record<number, PropertyState>
): number {
  let total = money;
  for (const cell of BOARD_CELLS) {
    const prop = properties[cell.index];
    if (prop && prop.ownerId === playerId && cell.price) {
      total += prop.isMortgaged ? Math.floor(cell.price * 0.5) : cell.price;
      if (prop.branches > 0 && cell.branchCost) {
        total += prop.branches * cell.branchCost;
      }
    }
  }
  return total;
}

export function calculateMaxLiquidatableCash(
  playerId: string,
  money: number,
  properties: Record<number, PropertyState>
): number {
  let cash = money;
  for (const cell of BOARD_CELLS) {
    const prop = properties[cell.index];
    if (prop && prop.ownerId === playerId && cell.price) {
      if (prop.branches > 0 && cell.branchCost) {
        cash += prop.branches * Math.floor(cell.branchCost * 0.5);
      }
      if (!prop.isMortgaged) {
        cash += Math.floor(cell.price * 0.5);
      }
    }
  }
  return cash;
}

export function getCellGridPosition(index: number): {
  row: number;
  col: number;
  side: 'top' | 'right' | 'bottom' | 'left' | 'corner';
} {
  if (index === 0) return { row: 1, col: 1, side: 'corner' };
  if (index > 0 && index < 10) return { row: 1, col: index + 1, side: 'top' };
  if (index === 10) return { row: 1, col: 11, side: 'corner' };
  if (index > 10 && index < 20)
    return { row: index - 10 + 1, col: 11, side: 'right' };
  if (index === 20) return { row: 11, col: 11, side: 'corner' };
  if (index > 20 && index < 30)
    return { row: 11, col: 11 - (index - 20), side: 'bottom' };
  if (index === 30) return { row: 11, col: 1, side: 'corner' };
  return { row: 11 - (index - 30), col: 1, side: 'left' };
}

export function formatMoney(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(Math.round(amount));
  return `${sign}${abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} ₴`;
}

/**
 * Parses any user room input — full invite URL (?room=UA-4821), "UA-4821",
 * "ua4821", "UA 4821", or bare 4-digit "4821" — into canonical "UA-XXXX".
 */
export function parseRoomCodeInput(raw: string): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '';

  // 1. If input is or contains a URL query param ?room=...
  const roomParamMatch = trimmed.match(/[?&]room=([^&#\s]+)/i);
  const candidate = roomParamMatch
    ? decodeURIComponent(roomParamMatch[1]).trim()
    : trimmed;

  const upper = candidate.toUpperCase();

  // 2. Match UA-1234, UA1234, UA 1234, UA_1234 anywhere in candidate
  const uaCodeMatch = upper.match(/UA[-\s_]?(\d{4})\b/);
  if (uaCodeMatch) {
    return `UA-${uaCodeMatch[1]}`;
  }

  // 3. Bare 4 digits "4821"
  if (/^\d{4}$/.test(upper)) {
    return `UA-${upper}`;
  }

  return upper;
}
