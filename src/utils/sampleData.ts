import { LibraryItem, Library, PersonalizedShelf } from '../types/audiobookshelf';

export const SAMPLE_LIBRARIES: Library[] = [
  {
    id: 'lib_light_novels',
    name: 'Light Novels & Ebooks',
    mediaType: 'book',
    icon: 'book',
  },
  {
    id: 'lib_audiobooks',
    name: 'Audiobooks',
    mediaType: 'book',
    icon: 'headphones',
  },
];

export const SAMPLE_ITEMS: LibraryItem[] = [
  {
    id: 'li_mushoku_17',
    libraryId: 'lib_light_novels',
    mediaType: 'book',
    media: {
      metadata: {
        title: 'Mushoku Tensei: Jobless Reincarnation, Vol. 17',
        subtitle: 'Light Novel Series',
        authorName: 'Rifujin na Magonote',
        narratorName: 'Seven Seas Audio',
        publishedYear: 2022,
        series: [{ name: 'Mushoku Tensei: Jobless Reincarnation', sequence: '17' }],
        genres: ['Fantasy', 'Isekai', 'Adventure', 'Drama'],
        description: 'Having arrived in the Asura Kingdom alongside Sylphie and Eris to assist Ariel Anemoi Asura in her claim to the throne, Rudeus Greyrat must navigate high-stakes royal politics and covert hostile factions.',
        duration: 33468, // ~9.3 hours
      },
      duration: 33468,
      numChapters: 9,
      chapters: [
        { id: 1, start: 0, end: 3200, title: 'Chapter 1: Arrival in the Capital' },
        { id: 2, start: 3200, end: 6800, title: 'Chapter 2: The Second Princess' },
        { id: 3, start: 6800, end: 10400, title: 'Chapter 3: Silver Palace Intrigue' },
        { id: 4, start: 10400, end: 14200, title: 'Chapter 4: A Gathering of Nobles' },
        { id: 5, start: 14200, end: 17800, title: 'Chapter 5: Whispers in the Shadows' },
        { id: 6, start: 17800, end: 22400, title: 'Chapter 6: On the Road' },
        { id: 7, start: 22400, end: 26800, title: 'Chapter 7: Confrontation at the Boundary' },
        { id: 8, start: 26800, end: 30400, title: 'Chapter 8: The Verdict of Asura' },
        { id: 9, start: 30400, end: 33468, title: 'Epilogue: Across the Horizon' },
      ],
      ebookFile: {
        ino: 'ino_mt_17',
        filename: 'Mushoku Tensei - Volume 17.epub',
        ext: '.epub',
        size: 8452100,
      },
    },
    userMediaProgress: {
      userId: 'user_local',
      libraryItemId: 'li_mushoku_17',
      duration: 33468,
      currentTime: 12718,
      progress: 0.38,
      isFinished: false,
      ebookLocation: 'epubcfi(/6/14[chap06]!/4/2/18/1:0)',
      ebookProgress: 0.38,
      lastUpdate: Date.now() - 3600000,
    },
  },
  {
    id: 'li_cote_vol1',
    libraryId: 'lib_light_novels',
    mediaType: 'book',
    media: {
      metadata: {
        title: 'Classroom of the Elite: Year 2, Vol. 1',
        authorName: 'Syougo Kinugasa',
        narratorName: 'Michael Gallagher',
        publishedYear: 2021,
        series: [{ name: 'Classroom of the Elite: Year 2', sequence: '1' }],
        genres: ['Psychological', 'School', 'Drama'],
        description: 'The second year begins at Advanced Nurturing High School. New first-years arrive with special instructions to expel Kiyotaka Ayanokouji.',
        duration: 28400,
      },
      duration: 28400,
      numChapters: 8,
      chapters: [
        { id: 1, start: 0, end: 3500, title: 'Prologue: The White Room Operative' },
        { id: 2, start: 3500, end: 7200, title: 'Chapter 1: The Entrance Ceremony' },
        { id: 3, start: 7200, end: 12000, title: 'Chapter 2: Special Exam Rules' },
        { id: 4, start: 12000, end: 18000, title: 'Chapter 3: Partner Negotiations' },
      ],
      ebookFile: {
        ino: 'ino_cote_y2_1',
        filename: 'Classroom of the Elite Y2V1.epub',
        ext: '.epub',
        size: 5120000,
      },
    },
    userMediaProgress: {
      userId: 'user_local',
      libraryItemId: 'li_cote_vol1',
      duration: 28400,
      currentTime: 4200,
      progress: 0.15,
      isFinished: false,
      ebookLocation: 'chap_2',
      ebookProgress: 0.15,
      lastUpdate: Date.now() - 86400000,
    },
  },
  {
    id: 'li_dune',
    libraryId: 'lib_audiobooks',
    mediaType: 'book',
    media: {
      metadata: {
        title: 'Dune',
        authorName: 'Frank Herbert',
        narratorName: 'Scott Brick, Orlagh Cassidy',
        publishedYear: 1965,
        series: [{ name: 'Dune Chronicles', sequence: '1' }],
        genres: ['Science Fiction', 'Epic', 'Space Opera'],
        description: 'Set on the desert planet Arrakis, Dune tells the story of the boy Paul Atreides, heir to a noble family tasked with ruling an inhospitable world where the only thing of value is the spice melange.',
        duration: 75600,
      },
      duration: 75600,
      numChapters: 3,
      chapters: [
        { id: 1, start: 0, end: 25000, title: 'Book One: Dune' },
        { id: 2, start: 25000, end: 50000, title: 'Book Two: Muad’Dib' },
        { id: 3, start: 50000, end: 75600, title: 'Book Three: The Prophet' },
      ],
    },
    userMediaProgress: {
      userId: 'user_local',
      libraryItemId: 'li_dune',
      duration: 75600,
      currentTime: 45360,
      progress: 0.60,
      isFinished: false,
      lastUpdate: Date.now() - 172800000,
    },
  },
];

export const SAMPLE_SHELVES: PersonalizedShelf[] = [
  {
    id: 'continue-listening',
    label: 'Continue Listening',
    type: 'book',
    entities: [SAMPLE_ITEMS[0], SAMPLE_ITEMS[2]],
  },
  {
    id: 'continue-reading',
    label: 'Continue Reading',
    type: 'book',
    entities: [SAMPLE_ITEMS[0], SAMPLE_ITEMS[1]],
  },
  {
    id: 'recently-added',
    label: 'Recently Added',
    type: 'book',
    entities: SAMPLE_ITEMS,
  },
];
