import type { GrandLineSaga, GrandLineArc } from "../types.js";

export const FISHMAN_ISLAND_SAGA: GrandLineSaga = {
  "id": "fishman-island",
  "name": "Fishman Island Saga",
  "order": 7,
  "arcCount": 2,
  "episodeCount": 27,
  "arcs": [
    {
      "id": "return-to-sabaody",
      "title": "Return to Sabaody",
      "order": 28,
      "episodeCount": 3,
      "duration": "1 hr, 38 min",
      "mangaChapters": "598\u2013602",
      "animeEpisodes": "517\u2013522",
      "synopsis": "Two years have passed since the Straw Hats were forcibly separated, and they reconvene back at Sabaody stronger and even more committed to the journey ahead."
    },
    {
      "id": "fishman-island",
      "title": "Fishman Island",
      "order": 29,
      "episodeCount": 24,
      "duration": "12 hr, 59 min",
      "mangaChapters": "603\u2013653",
      "animeEpisodes": "523\u2013541, 543\u2013573",
      "synopsis": "The path the to the New World takes the Straw Hats thousands of leagues under the sea to the underwater Fishman Island. However, the island's dark past is reaching a breaking point, and Luffy and his crew are caught in the middle of the conflict."
    }
  ]
};

export const FISHMAN_ISLAND_ARCS: GrandLineArc[] = [
  {
    "id": "return-to-sabaody",
    "title": "Return to Sabaody",
    "sagaId": "fishman-island",
    "sagaName": "Fishman Island Saga",
    "order": 28,
    "mangaChapters": "598\u2013602",
    "animeEpisodes": "517\u2013522",
    "duration": "1 hr, 38 min",
    "synopsis": "Two years have passed since the Straw Hats were forcibly separated, and they reconvene back at Sabaody stronger and even more committed to the journey ahead.",
    "episodeCount": 3,
    "episodes": [
      {
        "id": "return-to-sabaody-01",
        "arcId": "return-to-sabaody",
        "episodeNumber": "01",
        "title": "Two Years Later",
        "mangaChapters": "598\u2013599",
        "animeEpisodes": "517\u2013519",
        "duration": "34 min",
        "synopsis": "Two years after the Summit War, the Straw Hat crew finally returns to Sabaody. However, the archipelago has changed, and with dangerous pirates lurking around in droves, their departure to the New World may not go as smoothly as hoped.",
        "watchUrl": "https://onepace.net/en/watch#return-to-sabaody-01",
        "downloads": []
      },
      {
        "id": "return-to-sabaody-02",
        "arcId": "return-to-sabaody",
        "episodeNumber": "02",
        "title": "Island of New Beginnings",
        "mangaChapters": "599\u2013600",
        "animeEpisodes": "518\u2013520",
        "duration": "31 min",
        "synopsis": "Luffy, in disguise, crosses paths with the fake Luffy, and the imposter finds himself on the receiving end of a mysterious power. Meanwhile, Sentomaru and the Marines have yet again amassed a team of Pacifistas.",
        "watchUrl": "https://onepace.net/en/watch#return-to-sabaody-02",
        "downloads": []
      },
      {
        "id": "return-to-sabaody-03",
        "arcId": "return-to-sabaody",
        "episodeNumber": "03",
        "title": "Dive, Dive, Dive!",
        "mangaChapters": "601\u2013602",
        "animeEpisodes": "520\u2013522",
        "duration": "33 min",
        "synopsis": "After two long years and one chaotic afternoon, the Straw Hats are finally ready to renew their voyage. However, before they can set off to Fishman Island, they must contend with a massive Marine force determined to stop them.",
        "watchUrl": "https://onepace.net/en/watch#return-to-sabaody-03",
        "downloads": []
      }
    ]
  },
  {
    "id": "fishman-island",
    "title": "Fishman Island",
    "sagaId": "fishman-island",
    "sagaName": "Fishman Island Saga",
    "order": 29,
    "mangaChapters": "603\u2013653",
    "animeEpisodes": "523\u2013541, 543\u2013573",
    "duration": "12 hr, 59 min",
    "synopsis": "The path the to the New World takes the Straw Hats thousands of leagues under the sea to the underwater Fishman Island. However, the island's dark past is reaching a breaking point, and Luffy and his crew are caught in the middle of the conflict.",
    "episodeCount": 24,
    "episodes": [
      {
        "id": "fishman-island-01",
        "arcId": "fishman-island",
        "episodeNumber": "01",
        "title": "To the Deep Sea",
        "mangaChapters": "603\u2013604",
        "animeEpisodes": "523\u2013524",
        "duration": "31 min",
        "synopsis": "Encased in a protective bubble, the Sunny departs for Fishman Island far under the sea. As the Straw Hats marvel at the sights, Franky tells the crew about their greatest ally in their time apart. But suddenly, a mysterious shadow closes in on the ship.",
        "watchUrl": "https://onepace.net/en/watch#fishman-island-01",
        "downloads": []
      },
      {
        "id": "fishman-island-02",
        "arcId": "fishman-island",
        "episodeNumber": "02",
        "title": "Adventure in the Deep Sea",
        "mangaChapters": "605\u2013606",
        "animeEpisodes": "524\u2013526",
        "duration": "28 min",
        "synopsis": "Luffy, Zoro, and Sanji leave the relative safety of the Sunny to face the Kraken in its own territory. Putting their powerful new skills to work, they survive the encounter but are swept away by a downward current and become lost in the murky depths.",
        "watchUrl": "https://onepace.net/en/watch#fishman-island-02",
        "downloads": []
      },
      {
        "id": "fishman-island-03",
        "arcId": "fishman-island",
        "episodeNumber": "03",
        "title": "Landing on Fishman Island! The Mermaid Cove and Gyoverly Hills!",
        "mangaChapters": "607\u2013608",
        "animeEpisodes": "526\u2013527",
        "duration": "24 min",
        "synopsis": "After a near miss with a creepy undersea ship and Fishman Island in sight, Luffy\u2019s crew is halted by a group of fishmen riding atop sea kings. But time is of the essence, so the Straw Hats attempt a desperate maneuver.",
        "watchUrl": "https://onepace.net/en/watch#fishman-island-03",
        "downloads": []
      },
      {
        "id": "fishman-island-04",
        "arcId": "fishman-island",
        "episodeNumber": "04",
        "title": "Arrival at Coral Hill! The Nosebleed and the Devastating Prediction!",
        "mangaChapters": "609\u2013610",
        "animeEpisodes": "528\u2013529",
        "duration": "28 min",
        "synopsis": "The mermaids of Fishman Island give the Straw Hats a warm welcome, but Sanji is struck with a sudden medical emergency! Luffy and co. take their anemic friend to the Mermaid Cafe to rest, where they are introduced to its soothsaying owner.",
        "watchUrl": "https://onepace.net/en/watch#fishman-island-04",
        "downloads": []
      },
      {
        "id": "fishman-island-05",
        "arcId": "fishman-island",
        "episodeNumber": "05",
        "title": "The King of Fishman Island Invited to Ryugu Palace!",
        "mangaChapters": "611\u2013612",
        "animeEpisodes": "530\u2013531",
        "duration": "27 min",
        "synopsis": "The pirates receive an unexpected invitation to Ryugu Palace from Neptune himself, king of Fishman Island. Tempted by the smell of food, Luffy wanders the palace and soon finds an enormous tower with a sturdy yet battle-worn door.",
        "watchUrl": "https://onepace.net/en/watch#fishman-island-05",
        "downloads": []
      },
      {
        "id": "fishman-island-06",
        "arcId": "fishman-island",
        "episodeNumber": "06",
        "title": "The Mermaid Princess in Hard-Shell Tower! Shirahoshi of the Neptune Family!",
        "mangaChapters": "613\u2013614",
        "animeEpisodes": "532\u2013533",
        "duration": "29 min",
        "synopsis": "Plagued by the unwanted advances of a lunatic fishman with a dangerous power, Mermaid Princess Shirahoshi has been hidden away in a lonely tower for years. Meanwhile in the palace, things take a sour turn for the Straw Hats.",
        "watchUrl": "https://onepace.net/en/watch#fishman-island-06",
        "downloads": []
      },
      {
        "id": "fishman-island-07",
        "arcId": "fishman-island",
        "episodeNumber": "07",
        "title": "The Shirahoshi Kidnapping Incident and the Curse of the Mato Mato!",
        "mangaChapters": "614\u2013615",
        "animeEpisodes": "533\u2013534",
        "duration": "34 min",
        "synopsis": "Ryugu Palace falls into chaos. While Luffy escapes with Shirahoshi, the pirates who infiltrated its walls attack with a strange desperation. After a scuffle of their own, Sanji and Chopper come across an old friend with troubling injuries.",
        "watchUrl": "https://onepace.net/en/watch#fishman-island-07",
        "downloads": []
      },
      {
        "id": "fishman-island-08",
        "arcId": "fishman-island",
        "episodeNumber": "08",
        "title": "The Beginning of the Vengeful Plan! Zoro vs. Hody!",
        "mangaChapters": "616\u2013618",
        "animeEpisodes": "535\u2013537",
        "duration": "45 min",
        "synopsis": "Hody\u2019s plan for revenge is set in motion, and the Straw Hats who have unwittingly taken control of the palace must now defend it against the New Fishman Pirates. Outside, Luffy\u2019s excursion with Shirahoshi is rudely interrupted.",
        "watchUrl": "https://onepace.net/en/watch#fishman-island-08",
        "downloads": []
      },
      {
        "id": "fishman-island-09",
        "arcId": "fishman-island",
        "episodeNumber": "09",
        "title": "At the Sea Forest! Arlong and Hody",
        "mangaChapters": "619\u2013620",
        "animeEpisodes": "538\u2013539",
        "duration": "34 min",
        "synopsis": "Jinbe reunites with Luffy in the undersea forest and reveals a shocking connection to an old foe. The former Warlord begins a tale of when two famous figures fought to undo the animosity that existed between humans and fishmen.",
        "watchUrl": "https://onepace.net/en/watch#fishman-island-09",
        "downloads": []
      },
      {
        "id": "fishman-island-10",
        "arcId": "fishman-island",
        "episodeNumber": "10",
        "title": "Otohime, Fisher Tiger, and the Sun Pirates! The Fateful Encounter!",
        "mangaChapters": "621\u2013622",
        "animeEpisodes": "540\u2013541",
        "duration": "35 min",
        "synopsis": "Queen Otohime tried to lead the Ryugu Kingdom into an era of coexistence between humans and fishmen. At the same time, the heroic Fisher Tiger battled humans to free their slaves from captivity.",
        "watchUrl": "https://onepace.net/en/watch#fishman-island-10",
        "downloads": []
      },
      {
        "id": "fishman-island-11",
        "arcId": "fishman-island",
        "episodeNumber": "11",
        "title": "The Shocking Truth of Tiger! The End of the Sun Pirates",
        "mangaChapters": "623\u2013624",
        "animeEpisodes": "543\u2013545",
        "duration": "35 min",
        "synopsis": "Fisher Tiger\u2019s past quickly caught up to him, and he left his crew with a sobering, final command. While Jinbe vowed to uphold Tiger\u2019s and Otohime\u2019s ideals, Arlong\u2019s resentment only grew, and soon, the Sun Pirates faced a crisis of identity.",
        "watchUrl": "https://onepace.net/en/watch#fishman-island-11",
        "downloads": []
      },
      {
        "id": "fishman-island-12",
        "arcId": "fishman-island",
        "episodeNumber": "12",
        "title": "The Shipwrecked Celestial Dragon! A Bullet That Seals the Future",
        "mangaChapters": "625\u2013626",
        "animeEpisodes": "545\u2013546",
        "duration": "39 min",
        "synopsis": "The sudden appearance of a Celestial Dragon almost imperiled Fishman Island, but Queen Otohime\u2019s ability to end hostilities provided a ray of hope for everyone. Just when the path to the future seemed bright, a shot echoed through the plaza.",
        "watchUrl": "https://onepace.net/en/watch#fishman-island-12",
        "downloads": []
      },
      {
        "id": "fishman-island-13",
        "arcId": "fishman-island",
        "episodeNumber": "13",
        "title": "Shaking of the Kingdom! Luffy vs. Jinbe!",
        "mangaChapters": "627\u2013629",
        "animeEpisodes": "547\u2013550",
        "duration": "34 min",
        "synopsis": "After completing his tale, Jinbe begs Nami for forgiveness. Soon after, Hody broadcasts across all of Fishman Island, and all watch in horror as he conducts his hostile takeover. Luffy is ready to fight, but Jinbe has something else in mind.",
        "watchUrl": "https://onepace.net/en/watch#fishman-island-13",
        "downloads": []
      },
      {
        "id": "fishman-island-14",
        "arcId": "fishman-island",
        "episodeNumber": "14",
        "title": "Gyoncorde Plaza Gathering! The Evil Drug's True Power",
        "mangaChapters": "630\u2013631",
        "animeEpisodes": "550\u2013551",
        "duration": "28 min",
        "synopsis": "Hody experiences a strange side effect of the energy steroids, and his body undergoes a horrifying transformation! The three princes of the Ryugu Kingdom rush to the scene, but Hody's crewmates have a dirty trick up their sleeves.",
        "watchUrl": "https://onepace.net/en/watch#fishman-island-14",
        "downloads": []
      },
      {
        "id": "fishman-island-15",
        "arcId": "fishman-island",
        "episodeNumber": "15",
        "title": "Hody's Dark Secret! The Straw Hats' Arrival",
        "mangaChapters": "632\u2013633",
        "animeEpisodes": "552\u2013553",
        "duration": "30 min",
        "synopsis": "Shirahoshi and Jinbe hurry to free King Neptune but run headlong into a trap. There, Hody reveals a shocking truth about the history of his revolution, but even in the face of Hody\u2019s cruelty, Shirahoshi holds true to her mother\u2019s dying wish.",
        "watchUrl": "https://onepace.net/en/watch#fishman-island-15",
        "downloads": []
      },
      {
        "id": "fishman-island-16",
        "arcId": "fishman-island",
        "episodeNumber": "16",
        "title": "100,000 vs. 10! The Straw Hats' Explosive Moves",
        "mangaChapters": "634\u2013635",
        "animeEpisodes": "554\u2013556",
        "duration": "36 min",
        "synopsis": "The Straw Hats have reassembled at last, an army of New Fishman Pirates standing before them. With the last two years still fresh in their minds, the Straw Hats\u2019 training is put to the test, and they unleash a flurry of new techniques.",
        "watchUrl": "https://onepace.net/en/watch#fishman-island-16",
        "downloads": []
      },
      {
        "id": "fishman-island-17",
        "arcId": "fishman-island",
        "episodeNumber": "17",
        "title": "The General from the Future Land and the Crisis of Fishman Island's Destruction",
        "mangaChapters": "636\u2013637",
        "animeEpisodes": "556\u2013558",
        "duration": "28 min",
        "synopsis": "Franky\u2019s mechanical masterpieces have transformations in store that can only be described as \"super!\" However, onlookers curb their enthusiasm when a foreboding shadow is cast upon the plaza by a giant ship hurtling toward the island!",
        "watchUrl": "https://onepace.net/en/watch#fishman-island-17",
        "downloads": []
      },
      {
        "id": "fishman-island-18",
        "arcId": "fishman-island",
        "episodeNumber": "18",
        "title": "I'll Protect Everything",
        "mangaChapters": "638\u2013639",
        "animeEpisodes": "559\u2013560",
        "duration": "24 min",
        "synopsis": "Shirahoshi flees into the open sea, hoping to draw the Noah away from Fishman Island. Luffy follows her, but he must contend with Hody Jones along the way. Luckily, the appearance of a new ally gives Luffy a chance to protect Shirahoshi.",
        "watchUrl": "https://onepace.net/en/watch#fishman-island-18",
        "downloads": []
      },
      {
        "id": "fishman-island-19",
        "arcId": "fishman-island",
        "episodeNumber": "19",
        "title": "What Are You?",
        "mangaChapters": "640\u2013641",
        "animeEpisodes": "561\u2013562",
        "duration": "35 min",
        "synopsis": "The Straw Hats hold their own against the powerful officers from Hody\u2019s crew. But their struggle will be in vain if Luffy cannot stop the Noah. Meanwhile, Hody becomes stronger than ever.",
        "watchUrl": "https://onepace.net/en/watch#fishman-island-19",
        "downloads": []
      },
      {
        "id": "fishman-island-20",
        "arcId": "fishman-island",
        "episodeNumber": "20",
        "title": "Phantom",
        "mangaChapters": "642\u2013645",
        "animeEpisodes": "562\u2013567",
        "duration": "30 min",
        "synopsis": "Neptune\u2019s army aids the Straw Hats against the New Fishman Pirates, finally accepting the crew as allies. As the fight continues, Fukaboshi\u2019s transponder snail reveals the bone chilling truth behind Hody's motivations.",
        "watchUrl": "https://onepace.net/en/watch#fishman-island-20",
        "downloads": []
      },
      {
        "id": "fishman-island-21",
        "arcId": "fishman-island",
        "episodeNumber": "21",
        "title": "Death Is Also Revenge",
        "mangaChapters": "643\u2013646",
        "animeEpisodes": "562\u2013567",
        "duration": "29 min",
        "synopsis": "Luffy has a fist of fire with Hody\u2019s name on it, and the rest of the Straw Hats push forward with all their might. Hody takes even more energy steroids, and a gravely injured Luffy struggles to overcome the fishman's unbelievable stamina.",
        "watchUrl": "https://onepace.net/en/watch#fishman-island-21",
        "downloads": []
      },
      {
        "id": "fishman-island-22",
        "arcId": "fishman-island",
        "episodeNumber": "22",
        "title": "The Path Toward the Sun",
        "mangaChapters": "647\u2013649",
        "animeEpisodes": "567\u2013569",
        "duration": "42 min",
        "synopsis": "Hody is vanquished, the Noah is stopped, and Fishman Island is saved! Unfortunately, Luffy was gravely injured in the process. With no time to spare, a true friend steps forward to tear down the walls of the island's history.",
        "watchUrl": "https://onepace.net/en/watch#fishman-island-22",
        "downloads": []
      },
      {
        "id": "fishman-island-23",
        "arcId": "fishman-island",
        "episodeNumber": "23",
        "title": "The Voice from the New World",
        "mangaChapters": "650\u2013651",
        "animeEpisodes": "570\u2013571",
        "duration": "31 min",
        "synopsis": "When pirates working for Big Mom appear, Fishman Island falls under threat from an adversary even stronger than Hody. Luffy steps up to save the fishmen once again but may doom himself by antagonizing one of the strongest pirates in the New World.",
        "watchUrl": "https://onepace.net/en/watch#fishman-island-23",
        "downloads": []
      },
      {
        "id": "fishman-island-24",
        "arcId": "fishman-island",
        "episodeNumber": "24",
        "title": "The Hero's Hat",
        "mangaChapters": "652\u2013653",
        "animeEpisodes": "572\u2013573",
        "duration": "32 min",
        "synopsis": "Filled with both excitement and trepidation, the crew finally sets sail for the New World. After bidding their fond farewells, the Straw Hats leave with a new log pose in hand. Overcoming trials and tragedies, Luffy's dream is on course once again!",
        "watchUrl": "https://onepace.net/en/watch#fishman-island-24",
        "downloads": []
      }
    ]
  }
];
