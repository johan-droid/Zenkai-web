import type { GrandLineSaga, GrandLineArc } from "../types.js";

export const EAST_BLUE_SAGA: GrandLineSaga = {
  "id": "east-blue",
  "name": "East Blue Saga",
  "order": 1,
  "arcCount": 8,
  "episodeCount": 38,
  "arcs": [
    {
      "id": "romance-dawn",
      "title": "Romance Dawn",
      "order": 1,
      "episodeCount": 4,
      "duration": "1 hr, 25 min",
      "mangaChapters": "1\u20137",
      "animeEpisodes": "1\u20133, 19, Episode of East Blue",
      "synopsis": "Monkey D. Luffy sets out on an adventure to form a crew, find the legendary One Piece, and become the Pirate King."
    },
    {
      "id": "orange-town",
      "title": "Orange Town",
      "order": 2,
      "episodeCount": 3,
      "duration": "1 hr, 28 min",
      "mangaChapters": "8\u201321",
      "animeEpisodes": "4\u20138",
      "synopsis": "Luffy and Zoro run afoul of a flashy crew of pirates and their captain, Buggy the Clown. They are joined by a young girl named Nami who helps them navigate this predicament."
    },
    {
      "id": "syrup-village",
      "title": "Syrup Village",
      "order": 3,
      "episodeCount": 7,
      "duration": "2 hr, 49 min",
      "mangaChapters": "23\u201341",
      "animeEpisodes": "9\u201317",
      "synopsis": "Luffy's fledgling pirate crew arrives at the slopes of Syrup Village. There they find a liar and a conspiracy to steal a young lady's fortune."
    },
    {
      "id": "gaimon",
      "title": "Gaimon",
      "order": 4,
      "episodeCount": 1,
      "duration": "21 min",
      "mangaChapters": "42, 22",
      "animeEpisodes": "18",
      "synopsis": "With Usopp now on the crew and their new ship, the Going Merry, under their command, the Straw Hats head to an island said to hold a fabled treasure. There they encounter a strange man stuck in a box who has been looking for the same treasure."
    },
    {
      "id": "baratie",
      "title": "Baratie",
      "order": 5,
      "episodeCount": 8,
      "duration": "3 hr, 36 min",
      "mangaChapters": "42\u201368",
      "animeEpisodes": "19\u201330, 135",
      "synopsis": "The Straw Hats head to the ocean-going restaurant, Baratie, with the hopes of recruiting one of their cooks. In the meantime, hungry yet powerful forces gather to lay siege to the restaurant \u2014 all while a menacing swordsman from the Grand Line steadily approaches."
    },
    {
      "id": "arlong-park",
      "title": "Arlong Park",
      "order": 6,
      "episodeCount": 10,
      "duration": "4 hr, 21 min",
      "mangaChapters": "69\u201395",
      "animeEpisodes": "31\u201344",
      "synopsis": "Nami's hometown has long been overrun by Arlong and his band of fishmen from the Grand Line. When the Straw Hats arrive, they find that their prospective navigator has left out a few key details about herself."
    },
    {
      "id": "the-adventures-of-buggys-crew",
      "title": "The Adventures of Buggy's Crew",
      "order": 7,
      "episodeCount": 1,
      "duration": "23 min",
      "mangaChapters": "35\u201375 cover stories",
      "animeEpisodes": "46\u201347",
      "synopsis": "Buggy, after being defeated by Luffy, Zoro, and Nami, begins his quest to regain his body parts and his crew, and then he will get his flashy revenge on Luffy."
    },
    {
      "id": "loguetown",
      "title": "Loguetown",
      "order": 8,
      "episodeCount": 4,
      "duration": "1 hr, 30 min",
      "mangaChapters": "96\u2013100, Loguetown Arc (Novel)",
      "animeEpisodes": "45, 48\u201353",
      "synopsis": "The final island before entering the Grand Line: Loguetown. Luffy and his crew drop anchor to stock up, sightsee, and pay their respects to the place where Gold Roger drew his last breath."
    }
  ]
};

export const EAST_BLUE_ARCS: GrandLineArc[] = [
  {
    "id": "romance-dawn",
    "title": "Romance Dawn",
    "sagaId": "east-blue",
    "sagaName": "East Blue Saga",
    "order": 1,
    "mangaChapters": "1\u20137",
    "animeEpisodes": "1\u20133, 19, Episode of East Blue",
    "duration": "1 hr, 25 min",
    "synopsis": "Monkey D. Luffy sets out on an adventure to form a crew, find the legendary One Piece, and become the Pirate King.",
    "episodeCount": 4,
    "episodes": [
      {
        "id": "romance-dawn-01",
        "arcId": "romance-dawn",
        "episodeNumber": "01",
        "title": "ROMANCE DAWN, ~The Dawn of an Adventure~",
        "mangaChapters": "1",
        "animeEpisodes": "Episode of East Blue",
        "duration": "17 min",
        "synopsis": "Influenced by the straw-hat-wearing pirate Red-Haired Shanks, an enthusiastic young boy named Monkey D. Luffy dreams of one day becoming King of the Pirates.",
        "watchUrl": "https://onepace.net/en/watch#romance-dawn-01",
        "downloads": []
      },
      {
        "id": "romance-dawn-02",
        "arcId": "romance-dawn",
        "episodeNumber": "02",
        "title": "They Call Him \"Straw Hat\" Luffy",
        "mangaChapters": "2",
        "animeEpisodes": "1",
        "duration": "20 min",
        "synopsis": "While Alvida and her pirates plunder a cruise ship, they come across a barrel containing a strange boy named Monkey D. Luffy. The timid Koby befriends Luffy, and they share their grand dreams with each other.",
        "watchUrl": "https://onepace.net/en/watch#romance-dawn-02",
        "downloads": []
      },
      {
        "id": "romance-dawn-03",
        "arcId": "romance-dawn",
        "episodeNumber": "03",
        "title": "The Pirate King and the Master Swordsman",
        "mangaChapters": "3\u20135",
        "animeEpisodes": "2, 19",
        "duration": "28 min",
        "synopsis": "In search of members for his pirate crew, Luffy and his new friend Koby arrive at Shells Town. There, they track down the renowned Pirate Hunter Zoro but run afoul of Helmeppo, son of the infamous Captain Morgan.",
        "watchUrl": "https://onepace.net/en/watch#romance-dawn-03",
        "downloads": []
      },
      {
        "id": "romance-dawn-04",
        "arcId": "romance-dawn",
        "episodeNumber": "04",
        "title": "The First",
        "mangaChapters": "5\u20137",
        "animeEpisodes": "3",
        "duration": "18 min",
        "synopsis": "Luffy convinces the captive Zoro to join his pirate crew, but they must first defeat the tyrannical Captain Morgan.",
        "watchUrl": "https://onepace.net/en/watch#romance-dawn-04",
        "downloads": []
      }
    ]
  },
  {
    "id": "orange-town",
    "title": "Orange Town",
    "sagaId": "east-blue",
    "sagaName": "East Blue Saga",
    "order": 2,
    "mangaChapters": "8\u201321",
    "animeEpisodes": "4\u20138",
    "duration": "1 hr, 28 min",
    "synopsis": "Luffy and Zoro run afoul of a flashy crew of pirates and their captain, Buggy the Clown. They are joined by a young girl named Nami who helps them navigate this predicament.",
    "episodeCount": 3,
    "episodes": [
      {
        "id": "orange-town-01",
        "arcId": "orange-town",
        "episodeNumber": "01",
        "title": "Enter: Nami",
        "mangaChapters": "8\u201311",
        "animeEpisodes": "4\u20136",
        "duration": "28 min",
        "synopsis": "Nami, a street-smart girl who loves money and tangerines, makes Luffy's acquaintance. To save herself and steal a map to the Grand Line, she tricks Luffy into allowing her to turn him over to the infamous pirate Buggy the Clown.",
        "watchUrl": "https://onepace.net/en/watch#orange-town-01",
        "downloads": []
      },
      {
        "id": "orange-town-02",
        "arcId": "orange-town",
        "episodeNumber": "02",
        "title": "Treasure",
        "mangaChapters": "12\u201319",
        "animeEpisodes": "6\u20137",
        "duration": "36 min",
        "synopsis": "Luffy meets a small dog guarding his late master\u2019s store. Meanwhile, Beast Tamer Mohji, Cabaji the Acrobat, and the lion Richie show up in the streets of Orange Town to get revenge for Captain Buggy's humiliating loss.",
        "watchUrl": "https://onepace.net/en/watch#orange-town-02",
        "downloads": []
      },
      {
        "id": "orange-town-03",
        "arcId": "orange-town",
        "episodeNumber": "03",
        "title": "Pirate Buggy \"the Clown\"",
        "mangaChapters": "19\u201321",
        "animeEpisodes": "8",
        "duration": "22 min",
        "synopsis": "Shockingly, it turns out Captain Buggy and \"Red-Haired\" Shanks share a common history. When the bombastic clown rips Shanks' straw hat, Luffy's rage knows no bounds.",
        "watchUrl": "https://onepace.net/en/watch#orange-town-03",
        "downloads": []
      }
    ]
  },
  {
    "id": "syrup-village",
    "title": "Syrup Village",
    "sagaId": "east-blue",
    "sagaName": "East Blue Saga",
    "order": 3,
    "mangaChapters": "23\u201341",
    "animeEpisodes": "9\u201317",
    "duration": "2 hr, 49 min",
    "synopsis": "Luffy's fledgling pirate crew arrives at the slopes of Syrup Village. There they find a liar and a conspiracy to steal a young lady's fortune.",
    "episodeCount": 7,
    "episodes": [
      {
        "id": "syrup-village-01",
        "arcId": "syrup-village",
        "episodeNumber": "01",
        "title": "Enter: Captain Usopp",
        "mangaChapters": "23\u201325",
        "animeEpisodes": "9\u201310",
        "duration": "29 min",
        "synopsis": "With Nami joining as Luffy's navigator (though not as an actual member of the crew), they arrive at Syrup Village in search of a proper ship. There they meet a man claiming to be a pirate captain who also seems to have ties to \"Red-Haired\" Shanks.",
        "watchUrl": "https://onepace.net/en/watch#syrup-village-01",
        "downloads": []
      },
      {
        "id": "syrup-village-02",
        "arcId": "syrup-village",
        "episodeNumber": "02",
        "title": "Captain Kuro",
        "mangaChapters": "26\u201327",
        "animeEpisodes": "10\u201311",
        "duration": "22 min",
        "synopsis": "After uncovering a devious plot, Usopp warns the village and Kaya, but finds his years of lying make it difficult to convince people of the truth.",
        "watchUrl": "https://onepace.net/en/watch#syrup-village-02",
        "downloads": []
      },
      {
        "id": "syrup-village-03",
        "arcId": "syrup-village",
        "episodeNumber": "03",
        "title": "The Slope",
        "mangaChapters": "28\u201330",
        "animeEpisodes": "12\u201313",
        "duration": "25 min",
        "synopsis": "Usopp resolves that if he is to keep the peace, the town must continue to believe he is a liar, which means he cannot let Captain Kuro\u2019s men up the slope to the village! Luffy, Zoro, and Nami aid Usopp in his plan to keep the Black Cat Pirates at bay.",
        "watchUrl": "https://onepace.net/en/watch#syrup-village-03",
        "downloads": []
      },
      {
        "id": "syrup-village-04",
        "arcId": "syrup-village",
        "episodeNumber": "04",
        "title": "The Silent Man",
        "mangaChapters": "31\u201334",
        "animeEpisodes": "13\u201314",
        "duration": "31 min",
        "synopsis": "Captain Kuro makes his appearance, and with Zoro too injured to fight, Luffy incapacitated, and Usopp and Nami too weak to make a stand, the situation is desperate. However, Kaya herself arrives, intent on bargaining with Kuro.",
        "watchUrl": "https://onepace.net/en/watch#syrup-village-04",
        "downloads": []
      },
      {
        "id": "syrup-village-05",
        "arcId": "syrup-village",
        "episodeNumber": "05",
        "title": "The Pirate \"Kuro of a Hundred Plans\"",
        "mangaChapters": "35\u201337",
        "animeEpisodes": "15\u201316",
        "duration": "23 min",
        "synopsis": "While the fight between Luffy and Kuro continues, Jango works to force Kaya to bequeath her family's money to the Black Cat captain. Despite the Usopp Pirates' efforts to stop the hypnotist, it seems as if the transaction is all but inevitable.",
        "watchUrl": "https://onepace.net/en/watch#syrup-village-05",
        "downloads": []
      },
      {
        "id": "syrup-village-06",
        "arcId": "syrup-village",
        "episodeNumber": "06",
        "title": "For Whom the Bell Tolls",
        "mangaChapters": "38\u201339",
        "animeEpisodes": "16\u201317",
        "duration": "17 min",
        "synopsis": "Kuro's ultimate move attacks everything in the area, friend nor foe notwithstanding, and Luffy becomes enraged by Kuro's lack of regard for his crew.",
        "watchUrl": "https://onepace.net/en/watch#syrup-village-06",
        "downloads": []
      },
      {
        "id": "syrup-village-07",
        "arcId": "syrup-village",
        "episodeNumber": "07",
        "title": "To the Sea",
        "mangaChapters": "40\u201341",
        "animeEpisodes": "17",
        "duration": "19 min",
        "synopsis": "The island is saved without any villagers ever knowing of the tragedy that almost befell their home. Kaya, grateful to the Straw Hats for what they did, gifts them something invaluable for sailing the high seas. As Luffy and crew prepare to set sail, however, Usopp makes a big decision.",
        "watchUrl": "https://onepace.net/en/watch#syrup-village-07",
        "downloads": []
      }
    ]
  },
  {
    "id": "gaimon",
    "title": "Gaimon",
    "sagaId": "east-blue",
    "sagaName": "East Blue Saga",
    "order": 4,
    "mangaChapters": "42, 22",
    "animeEpisodes": "18",
    "duration": "21 min",
    "synopsis": "With Usopp now on the crew and their new ship, the Going Merry, under their command, the Straw Hats head to an island said to hold a fabled treasure. There they encounter a strange man stuck in a box who has been looking for the same treasure.",
    "episodeCount": 1,
    "episodes": [
      {
        "id": "gaimon-01",
        "arcId": "gaimon",
        "episodeNumber": "01",
        "title": "You're the Weird Animal",
        "mangaChapters": "42, 22",
        "animeEpisodes": "18",
        "duration": "21 min",
        "synopsis": "With Usopp now on the crew and their new ship, the Going Merry, under their command, the Straw Hats head to an island said to hold a fabled treasure. There they encounter a strange man stuck in a box who has been looking for the same treasure.",
        "watchUrl": "https://onepace.net/en/watch#gaimon-01",
        "downloads": []
      }
    ]
  },
  {
    "id": "baratie",
    "title": "Baratie",
    "sagaId": "east-blue",
    "sagaName": "East Blue Saga",
    "order": 5,
    "mangaChapters": "42\u201368",
    "animeEpisodes": "19\u201330, 135",
    "duration": "3 hr, 36 min",
    "synopsis": "The Straw Hats head to the ocean-going restaurant, Baratie, with the hopes of recruiting one of their cooks. In the meantime, hungry yet powerful forces gather to lay siege to the restaurant \u2014 all while a menacing swordsman from the Grand Line steadily approaches.",
    "episodeCount": 8,
    "episodes": [
      {
        "id": "baratie-01",
        "arcId": "baratie",
        "episodeNumber": "01",
        "title": "Enter: Sanji",
        "mangaChapters": "42\u201344",
        "animeEpisodes": "19\u201321",
        "duration": "30 min",
        "synopsis": "The Straw Hats happen across Zoro's former partners, Yosaku and Johnny, whose dietary dilemma reminds the pirates they still need a cook on their ship. Thus, they set sail for the sea restaurant Baratie, hoping to snag a chef.",
        "watchUrl": "https://onepace.net/en/watch#baratie-01",
        "downloads": []
      },
      {
        "id": "baratie-02",
        "arcId": "baratie",
        "episodeNumber": "02",
        "title": "Pirate Commodore Don Krieg",
        "mangaChapters": "45\u201347",
        "animeEpisodes": "21\u201323",
        "duration": "31 min",
        "synopsis": "Luffy is on hiatus from pirating to work as a cabin boy to pay off the damage done to the Baratie. While he tries to convince Sanji to join his crew, the pirate Gin brings the infamous Don Krieg and his starving forces to the sea restaurant.",
        "watchUrl": "https://onepace.net/en/watch#baratie-02",
        "downloads": []
      },
      {
        "id": "baratie-03",
        "arcId": "baratie",
        "episodeNumber": "03",
        "title": "The Oath",
        "mangaChapters": "48\u201352",
        "animeEpisodes": "23\u201324, 29, 135",
        "duration": "37 min",
        "synopsis": "As Nami steals the Going Merry, Hawk-Eye Mihawk, known far and wide as the world's greatest swordsman, arrives all the way from the Grand Line to finish off Don Krieg. However, Zoro challenges the deadly Mihawk to a duel in order to achieve his dream.",
        "watchUrl": "https://onepace.net/en/watch#baratie-03",
        "downloads": []
      },
      {
        "id": "baratie-04",
        "arcId": "baratie",
        "episodeNumber": "04",
        "title": "Pearl",
        "mangaChapters": "53\u201355",
        "animeEpisodes": "25",
        "duration": "20 min",
        "synopsis": "Mihawk departs after defeating Zoro, and Krieg continues his assault on the Baratie. Pearl, one of Krieg's strongest men, goes on the offensive with fiery attacks and multiple shields at his disposal, so Sanji reveals his unique fighting style.",
        "watchUrl": "https://onepace.net/en/watch#baratie-04",
        "downloads": []
      },
      {
        "id": "baratie-05",
        "arcId": "baratie",
        "episodeNumber": "05",
        "title": "Because of a Dream",
        "mangaChapters": "56\u201359",
        "animeEpisodes": "26",
        "duration": "21 min",
        "synopsis": "Sanji continues to battle Pearl, but Gin cleverly holds Chef Zeff hostage, forcing Sanji an impossible situation. Sanji's childhood memories flood his mind, and he reflects on why Zeff means so much to him.",
        "watchUrl": "https://onepace.net/en/watch#baratie-05",
        "downloads": []
      },
      {
        "id": "baratie-06",
        "arcId": "baratie",
        "episodeNumber": "06",
        "title": "MH5",
        "mangaChapters": "59\u201363",
        "animeEpisodes": "27\u201328",
        "duration": "27 min",
        "synopsis": "In a surprising twist, Gin finishes Pearl off himself, claiming Sanji as his own target. Though still wounded, Sanji rises to the challenge and faces off with Gin. As the battle draws to a close, Don Krieg unleashes a deadly toxin into the air.",
        "watchUrl": "https://onepace.net/en/watch#baratie-06",
        "downloads": []
      },
      {
        "id": "baratie-07",
        "arcId": "baratie",
        "episodeNumber": "07",
        "title": "The Stalwart War Spear",
        "mangaChapters": "63\u201367",
        "animeEpisodes": "28\u201329",
        "duration": "27 min",
        "synopsis": "The struggle with Krieg nears its end. Luffy's fighting spirit is unwavering, even after taking several hits from Krieg's Stalwart War Spear. Straw Hat\u2019s strategy shifts to smashing through Krieg\u2019s defenses and attacking the spear head-on.",
        "watchUrl": "https://onepace.net/en/watch#baratie-07",
        "downloads": []
      },
      {
        "id": "baratie-08",
        "arcId": "baratie",
        "episodeNumber": "08",
        "title": "The Fourth",
        "mangaChapters": "67\u201368",
        "animeEpisodes": "30",
        "duration": "18 min",
        "synopsis": "As the dust of battle settles, the still poisoned Gin decides to go back to the Grand Line with Krieg, and Sanji makes the difficult decision to join Luffy's crew. Suddenly, Yosaku returns with news of where Nami took the Going Merry.",
        "watchUrl": "https://onepace.net/en/watch#baratie-08",
        "downloads": []
      }
    ]
  },
  {
    "id": "arlong-park",
    "title": "Arlong Park",
    "sagaId": "east-blue",
    "sagaName": "East Blue Saga",
    "order": 6,
    "mangaChapters": "69\u201395",
    "animeEpisodes": "31\u201344",
    "duration": "4 hr, 21 min",
    "synopsis": "Nami's hometown has long been overrun by Arlong and his band of fishmen from the Grand Line. When the Straw Hats arrive, they find that their prospective navigator has left out a few key details about herself.",
    "episodeCount": 10,
    "episodes": [
      {
        "id": "arlong-park-01",
        "arcId": "arlong-park",
        "episodeNumber": "01",
        "title": "Arlong Park",
        "mangaChapters": "69\u201371",
        "animeEpisodes": "31\u201332",
        "duration": "30 min",
        "synopsis": "As they depart the Baratie in pursuit of Nami and the Going Merry, Yosaku warns Luffy and Sanji about the vicious Arlong and his fishman underlings. Meanwhile, Usopp, Johnny, and Zoro make landfall where Nami docked the Merry.",
        "watchUrl": "https://onepace.net/en/watch#arlong-park-01",
        "downloads": []
      },
      {
        "id": "arlong-park-02",
        "arcId": "arlong-park",
        "episodeNumber": "02",
        "title": "Monsters of the Grand Line",
        "mangaChapters": "72\u201374",
        "animeEpisodes": "31\u201333",
        "duration": "22 min",
        "synopsis": "Usopp, having challenged the fishmen, has been caught. To effectively prove her loyalty to the Arlong Pirates, Nami is left with a morbid choice.",
        "watchUrl": "https://onepace.net/en/watch#arlong-park-02",
        "downloads": []
      },
      {
        "id": "arlong-park-03",
        "arcId": "arlong-park",
        "episodeNumber": "03",
        "title": "Sea Charts and Fishmen",
        "mangaChapters": "74\u201376",
        "animeEpisodes": "33\u201334",
        "duration": "24 min",
        "synopsis": "Luffy\u2019s group has reached the island but are met with a shocking revelation. Unmoved by Nami\u2019s apparent actions and her insistence that he leaves, Luffy stubbornly sticks around.",
        "watchUrl": "https://onepace.net/en/watch#arlong-park-03",
        "downloads": []
      },
      {
        "id": "arlong-park-04",
        "arcId": "arlong-park",
        "episodeNumber": "04",
        "title": "Bell-m\u00e8re",
        "mangaChapters": "77\u201378",
        "animeEpisodes": "34\u201336",
        "duration": "26 min",
        "synopsis": "Nojiko goes into detail about Nami's childhood and their adoptive mother Bell-m\u00e8re, a former Marine. Despite being poor and unrelated by blood, they had a happy life on their tangerine orchard.",
        "watchUrl": "https://onepace.net/en/watch#arlong-park-04",
        "downloads": []
      },
      {
        "id": "arlong-park-05",
        "arcId": "arlong-park",
        "episodeNumber": "05",
        "title": "Live",
        "mangaChapters": "79\u201381",
        "animeEpisodes": "36\u201337",
        "duration": "30 min",
        "synopsis": "When a Marine officer under Arlong's pay confiscates all the money Nami accumulated over the years, it becomes clear where Arlong stands on his promise.",
        "watchUrl": "https://onepace.net/en/watch#arlong-park-05",
        "downloads": []
      },
      {
        "id": "arlong-park-06",
        "arcId": "arlong-park",
        "episodeNumber": "06",
        "title": "OK, LET'S STAND UP",
        "mangaChapters": "82\u201384",
        "animeEpisodes": "38\u201339",
        "duration": "25 min",
        "synopsis": "Nami's audible sorrows have reached the ears of a certain Straw Hat captain, and he and his crew rise to action. The villagers look on in awe as the Straw Hats boldly enter Arlong Park to face the fishmen.",
        "watchUrl": "https://onepace.net/en/watch#arlong-park-06",
        "downloads": []
      },
      {
        "id": "arlong-park-07",
        "arcId": "arlong-park",
        "episodeNumber": "07",
        "title": "Chivalry vs. Fishman Karate",
        "mangaChapters": "85\u201388",
        "animeEpisodes": "39\u201340",
        "duration": "26 min",
        "synopsis": "Luffy\u2019s newest move leaves him incapacitated and at the mercy of the sea while Zoro, Sanji, and Usopp desperately fight off Arlong\u2019s top officers.",
        "watchUrl": "https://onepace.net/en/watch#arlong-park-07",
        "downloads": []
      },
      {
        "id": "arlong-park-08",
        "arcId": "arlong-park",
        "episodeNumber": "08",
        "title": "My Turn",
        "mangaChapters": "88\u201391",
        "animeEpisodes": "39\u201342",
        "duration": "30 min",
        "synopsis": "The top officers are defeated, but as they currently are, Sanji and Zoro prove to be no match for Arlong. However, with Luffy finally free, he just may just be able to pull it off. Meanwhile, Nami finally gathers the courage to face Arlong.",
        "watchUrl": "https://onepace.net/en/watch#arlong-park-08",
        "downloads": []
      },
      {
        "id": "arlong-park-09",
        "arcId": "arlong-park",
        "episodeNumber": "09",
        "title": "The Second",
        "mangaChapters": "91\u201394",
        "animeEpisodes": "42\u201343",
        "duration": "20 min",
        "synopsis": "Luffy springs into action against Arlong, and their intense struggle commences! Luffy becomes enraged when he discovers how exactly Arlong had been using Nami, and he comes to a quick decision on how to finally free her of her shackles.",
        "watchUrl": "https://onepace.net/en/watch#arlong-park-09",
        "downloads": []
      },
      {
        "id": "arlong-park-10",
        "arcId": "arlong-park",
        "episodeNumber": "10",
        "title": "Spin, Pinwheel, Spin",
        "mangaChapters": "94\u201395",
        "animeEpisodes": "43\u201344",
        "duration": "22 min",
        "synopsis": "Arlong's reign of terror is over, so the island throws a party to celebrate their freedom and to honor their pirate saviors. During the festivities, Nami makes her decision to officially join the Straw Hat Pirates.",
        "watchUrl": "https://onepace.net/en/watch#arlong-park-10",
        "downloads": []
      }
    ]
  },
  {
    "id": "the-adventures-of-buggys-crew",
    "title": "The Adventures of Buggy's Crew",
    "sagaId": "east-blue",
    "sagaName": "East Blue Saga",
    "order": 7,
    "mangaChapters": "35\u201375 cover stories",
    "animeEpisodes": "46\u201347",
    "duration": "23 min",
    "synopsis": "Buggy, after being defeated by Luffy, Zoro, and Nami, begins his quest to regain his body parts and his crew, and then he will get his flashy revenge on Luffy.",
    "episodeCount": 1,
    "episodes": [
      {
        "id": "the-adventures-of-buggys-crew-01",
        "arcId": "the-adventures-of-buggys-crew",
        "episodeNumber": "01",
        "title": "The Adventures of Buggy's Crew",
        "mangaChapters": "35\u201375 cover stories",
        "animeEpisodes": "46\u201347",
        "duration": "23 min",
        "synopsis": "Buggy, after being defeated by Luffy, Zoro, and Nami, begins his quest to regain his body parts and his crew, and then he will get his flashy revenge on Luffy.",
        "watchUrl": "https://onepace.net/en/watch#the-adventures-of-buggys-crew-01",
        "downloads": []
      }
    ]
  },
  {
    "id": "loguetown",
    "title": "Loguetown",
    "sagaId": "east-blue",
    "sagaName": "East Blue Saga",
    "order": 8,
    "mangaChapters": "96\u2013100, Loguetown Arc (Novel)",
    "animeEpisodes": "45, 48\u201353",
    "duration": "1 hr, 30 min",
    "synopsis": "The final island before entering the Grand Line: Loguetown. Luffy and his crew drop anchor to stock up, sightsee, and pay their respects to the place where Gold Roger drew his last breath.",
    "episodeCount": 4,
    "episodes": [
      {
        "id": "loguetown-01",
        "arcId": "loguetown",
        "episodeNumber": "01",
        "title": "Kitetsu III",
        "mangaChapters": "96\u201397",
        "animeEpisodes": "45, 48\u201349",
        "duration": "28 min",
        "synopsis": "Touting a fresh bounty issued by Marine HQ, Luffy and co. make landfall at Loguetown, the place where Gold Roger was both born and executed. Being the last stop before the Grand Line, the crew stocks up on supplies and sightsees.",
        "watchUrl": "https://onepace.net/en/watch#loguetown-01",
        "downloads": []
      },
      {
        "id": "loguetown-01",
        "arcId": "loguetown",
        "episodeNumber": "01",
        "title": "01.5:\u2007Special: Daddy the Father",
        "mangaChapters": "Loguetown Arc (Novel)",
        "animeEpisodes": "48, 50",
        "duration": "21 min",
        "synopsis": "Usopp manages to anger the brat daughter of bounty hunter Daddy the Father and finds his own life at stake. When Daddy discovers that Usopp is the son of Red Hair Pirate Yasopp, the only man to beat him, he offers him a risky way out.",
        "watchUrl": "https://onepace.net/en/watch#loguetown-01.5",
        "downloads": []
      },
      {
        "id": "loguetown-02",
        "arcId": "loguetown",
        "episodeNumber": "02",
        "title": "Luffy Is Dead",
        "mangaChapters": "98\u201399",
        "animeEpisodes": "51\u201352",
        "duration": "19 min",
        "synopsis": "Luffy arrives at the execution platform, only to be caught in Buggy and Alvida's trap. Sanji and Zoro rush to stop Buggy from poetically\u2014and flashily\u2014executing Luffy where Roger died.",
        "watchUrl": "https://onepace.net/en/watch#loguetown-02",
        "downloads": []
      },
      {
        "id": "loguetown-03",
        "arcId": "loguetown",
        "episodeNumber": "03",
        "title": "The Legend Begins",
        "mangaChapters": "100",
        "animeEpisodes": "52\u201353",
        "duration": "19 min",
        "synopsis": "With Buggy's plan miraculously foiled and Captain \"White Chase\" Smoker now entering the fray, it's a mad dash for the Grand Line as the hands of fate push the Straw Hats toward their destiny.",
        "watchUrl": "https://onepace.net/en/watch#loguetown-03",
        "downloads": []
      }
    ]
  }
];
