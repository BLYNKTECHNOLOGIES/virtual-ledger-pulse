-- Seed question-bank content for the five knowledge skill sections (6 questions x 3 levels x 5 skills).
DO $$
DECLARE
  v_q uuid;
  v_v uuid;
  r record;
BEGIN
  IF (SELECT count(*) FROM public.cbt_questions WHERE category_tag = 'logical_reasoning') = 0 THEN
    FOR r IN SELECT * FROM (VALUES
        ('easy','{"prompt": "All operators are staff. Ravi is an operator. Therefore Ravi is…", "marks": 1, "options": [{"id": "a", "text": "Staff"}, {"id": "b", "text": "A manager"}, {"id": "c", "text": "Not staff"}, {"id": "d", "text": "Cannot say"}]}','a'),
        ('easy','{"prompt": "If today is Wednesday, what day will it be 10 days from now?", "marks": 1, "options": [{"id": "a", "text": "Saturday"}, {"id": "b", "text": "Friday"}, {"id": "c", "text": "Sunday"}, {"id": "d", "text": "Monday"}]}','a'),
        ('easy','{"prompt": "Find the odd one out: 3, 5, 11, 14, 17", "marks": 1, "options": [{"id": "a", "text": "14"}, {"id": "b", "text": "3"}, {"id": "c", "text": "11"}, {"id": "d", "text": "17"}]}','a'),
        ('easy','{"prompt": "Pen is to write as knife is to…", "marks": 1, "options": [{"id": "a", "text": "Cut"}, {"id": "b", "text": "Sharp"}, {"id": "c", "text": "Blade"}, {"id": "d", "text": "Steel"}]}','a'),
        ('easy','{"prompt": "A is taller than B. B is taller than C. Who is the shortest?", "marks": 1, "options": [{"id": "a", "text": "C"}, {"id": "b", "text": "A"}, {"id": "c", "text": "B"}, {"id": "d", "text": "Cannot say"}]}','a'),
        ('easy','{"prompt": "Statement: No fake note is genuine. Some notes are fake. Conclusion: Some notes are not genuine.", "marks": 1, "options": [{"id": "a", "text": "True"}, {"id": "b", "text": "False"}, {"id": "c", "text": "Cannot say"}]}','a'),
        ('medium','{"prompt": "Some clerks are auditors. All auditors are graduates. Conclusion: Some clerks are graduates.", "marks": 1, "options": [{"id": "a", "text": "Definitely true"}, {"id": "b", "text": "Definitely false"}, {"id": "c", "text": "Cannot be determined"}]}','c'),
        ('medium','{"prompt": "In a code, ORDER is written as PSEFS. How is TRADE written?", "marks": 1, "options": [{"id": "a", "text": "USBEF"}, {"id": "b", "text": "USBDF"}, {"id": "c", "text": "USCBF"}, {"id": "d", "text": "UTBEF"}]}','a'),
        ('medium','{"prompt": "Five people sit in a row. P sits left of Q but right of R. S sits right of Q. Who sits in the middle if T is at the far left?", "marks": 1, "options": [{"id": "a", "text": "P"}, {"id": "b", "text": "Q"}, {"id": "c", "text": "R"}, {"id": "d", "text": "S"}]}','a'),
        ('medium','{"prompt": "If all Bloops are Razzies and all Razzies are Lazzies, then all Bloops are definitely…", "marks": 1, "options": [{"id": "a", "text": "Lazzies"}, {"id": "b", "text": "Razzies only"}, {"id": "c", "text": "Neither"}, {"id": "d", "text": "Cannot say"}]}','a'),
        ('medium','{"prompt": "Pointing to a photo, Meena says, \"He is the son of my grandfather’s only son.\" How is the man related to Meena?", "marks": 1, "options": [{"id": "a", "text": "Brother"}, {"id": "b", "text": "Uncle"}, {"id": "c", "text": "Cousin"}, {"id": "d", "text": "Father"}]}','a'),
        ('medium','{"prompt": "Clock shows 3:15. What is the angle between the hands?", "marks": 1, "options": [{"id": "a", "text": "7.5°"}, {"id": "b", "text": "0°"}, {"id": "c", "text": "15°"}, {"id": "d", "text": "22.5°"}]}','a'),
        ('hard','{"prompt": "In a row of 40, Asha is 12th from the left and Beena is 9th from the right. How many people sit between them?", "marks": 1, "options": [{"id": "a", "text": "19"}, {"id": "b", "text": "18"}, {"id": "c", "text": "20"}, {"id": "d", "text": "21"}]}','a'),
        ('hard','{"prompt": "Six faces of a cube are painted red. It is cut into 64 equal small cubes. How many small cubes have exactly two painted faces?", "marks": 1, "options": [{"id": "a", "text": "24"}, {"id": "b", "text": "8"}, {"id": "c", "text": "16"}, {"id": "d", "text": "32"}]}','a'),
        ('hard','{"prompt": "If A + B means A is the mother of B; A − B means A is the brother of B; then P + M − Q means Q is P’s…", "marks": 1, "options": [{"id": "a", "text": "Nephew/Niece (child of P’s child’s brother)"}, {"id": "b", "text": "Son"}, {"id": "c", "text": "Brother"}, {"id": "d", "text": "Father"}]}','a'),
        ('hard','{"prompt": "Statements: All pens are books. No book is a chair. Conclusion I: No pen is a chair. Conclusion II: Some books are pens.", "marks": 1, "options": [{"id": "a", "text": "Both follow"}, {"id": "b", "text": "Only I follows"}, {"id": "c", "text": "Only II follows"}, {"id": "d", "text": "Neither follows"}]}','a'),
        ('hard','{"prompt": "A man walks 5 km north, turns right and walks 3 km, turns right again and walks 5 km. How far is he from the start?", "marks": 1, "options": [{"id": "a", "text": "3 km"}, {"id": "b", "text": "5 km"}, {"id": "c", "text": "8 km"}, {"id": "d", "text": "2 km"}]}','a'),
        ('hard','{"prompt": "In a certain code, 157 means \"sweet white rose\", 269 means \"red rose bud\", 534 means \"white lily bloom\". Which digit means \"white\"?", "marks": 1, "options": [{"id": "a", "text": "5"}, {"id": "b", "text": "1"}, {"id": "c", "text": "7"}, {"id": "d", "text": "3"}]}','a')
      ) AS t(diff, content, correct)
    LOOP
      INSERT INTO public.cbt_questions (type, category_tag, difficulty, status, approved_at)
      VALUES ('mcq', 'logical_reasoning', r.diff::public.cbt_difficulty, 'approved', now()) RETURNING id INTO v_q;
      INSERT INTO public.cbt_question_versions (question_id, version_no, content)
      VALUES (v_q, 1, r.content::jsonb) RETURNING id INTO v_v;
      INSERT INTO public.cbt_question_keys (question_version_id, correct_option_id) VALUES (v_v, r.correct);
      UPDATE public.cbt_questions SET current_version_id = v_v WHERE id = v_q;
    END LOOP;
  END IF;
  IF (SELECT count(*) FROM public.cbt_questions WHERE category_tag = 'problem_solving') = 0 THEN
    FOR r IN SELECT * FROM (VALUES
        ('easy','{"prompt": "A cashier collects ₹450 in the morning and ₹725 in the evening. What is the day’s total?", "marks": 1, "options": [{"id": "a", "text": "₹1,175"}, {"id": "b", "text": "₹1,275"}, {"id": "c", "text": "₹1,075"}, {"id": "d", "text": "₹1,225"}]}','a'),
        ('easy','{"prompt": "A pen costs ₹15. How much do 8 pens cost?", "marks": 1, "options": [{"id": "a", "text": "₹120"}, {"id": "b", "text": "₹110"}, {"id": "c", "text": "₹105"}, {"id": "d", "text": "₹130"}]}','a'),
        ('easy','{"prompt": "If 5 clerks finish a job in 10 days, how long would 10 clerks take at the same rate?", "marks": 1, "options": [{"id": "a", "text": "5 days"}, {"id": "b", "text": "10 days"}, {"id": "c", "text": "2 days"}, {"id": "d", "text": "20 days"}]}','a'),
        ('easy','{"prompt": "A bill of ₹2,400 is split equally among 6 people. Each pays…", "marks": 1, "options": [{"id": "a", "text": "₹400"}, {"id": "b", "text": "₹300"}, {"id": "c", "text": "₹500"}, {"id": "d", "text": "₹450"}]}','a'),
        ('easy','{"prompt": "What is 15% of 200?", "marks": 1, "options": [{"id": "a", "text": "30"}, {"id": "b", "text": "15"}, {"id": "c", "text": "25"}, {"id": "d", "text": "35"}]}','a'),
        ('easy','{"prompt": "A train covers 60 km in 1 hour. How far in 2.5 hours?", "marks": 1, "options": [{"id": "a", "text": "150 km"}, {"id": "b", "text": "120 km"}, {"id": "c", "text": "140 km"}, {"id": "d", "text": "160 km"}]}','a'),
        ('medium','{"prompt": "An item marked ₹800 is sold at 12% discount. The selling price is…", "marks": 1, "options": [{"id": "a", "text": "₹704"}, {"id": "b", "text": "₹696"}, {"id": "c", "text": "₹712"}, {"id": "d", "text": "₹688"}]}','a'),
        ('medium','{"prompt": "The average of five numbers is 27. If one number is 45, the average of the remaining four is…", "marks": 1, "options": [{"id": "a", "text": "22.5"}, {"id": "b", "text": "24"}, {"id": "c", "text": "21"}, {"id": "d", "text": "25"}]}','a'),
        ('medium','{"prompt": "A and B together finish work in 12 days. A alone takes 20 days. B alone takes…", "marks": 1, "options": [{"id": "a", "text": "30 days"}, {"id": "b", "text": "24 days"}, {"id": "c", "text": "32 days"}, {"id": "d", "text": "28 days"}]}','a'),
        ('medium','{"prompt": "₹12,000 is invested at 10% simple interest per year. Interest after 18 months is…", "marks": 1, "options": [{"id": "a", "text": "₹1,800"}, {"id": "b", "text": "₹1,200"}, {"id": "c", "text": "₹2,400"}, {"id": "d", "text": "₹1,500"}]}','a'),
        ('medium','{"prompt": "A ratio of 3:5 splits ₹4,800. The smaller share is…", "marks": 1, "options": [{"id": "a", "text": "₹1,800"}, {"id": "b", "text": "₹2,000"}, {"id": "c", "text": "₹1,600"}, {"id": "d", "text": "₹2,400"}]}','a'),
        ('medium','{"prompt": "After a 20% hike, a salary is ₹42,000. The original salary was…", "marks": 1, "options": [{"id": "a", "text": "₹35,000"}, {"id": "b", "text": "₹33,600"}, {"id": "c", "text": "₹36,000"}, {"id": "d", "text": "₹34,000"}]}','a'),
        ('hard','{"prompt": "A sum doubles in 8 years at simple interest. The annual rate is…", "marks": 1, "options": [{"id": "a", "text": "12.5%"}, {"id": "b", "text": "10%"}, {"id": "c", "text": "8%"}, {"id": "d", "text": "15%"}]}','a'),
        ('hard','{"prompt": "Two pipes fill a tank in 12 and 18 hours. A third empties it in 36 hours. All open together, the tank fills in…", "marks": 1, "options": [{"id": "a", "text": "9 hours"}, {"id": "b", "text": "8 hours"}, {"id": "c", "text": "10 hours"}, {"id": "d", "text": "7.2 hours"}]}','a'),
        ('hard','{"prompt": "Selling 2 articles at ₹990 each — one at 10% profit, one at 10% loss. Overall result…", "marks": 1, "options": [{"id": "a", "text": "Loss of ₹20"}, {"id": "b", "text": "No profit no loss"}, {"id": "c", "text": "Profit of ₹20"}, {"id": "d", "text": "Loss of ₹10"}]}','a'),
        ('hard','{"prompt": "A 300 m train crosses a 200 m platform in 25 seconds. Its speed is…", "marks": 1, "options": [{"id": "a", "text": "72 km/h"}, {"id": "b", "text": "60 km/h"}, {"id": "c", "text": "54 km/h"}, {"id": "d", "text": "80 km/h"}]}','a'),
        ('hard','{"prompt": "The compound interest on ₹10,000 at 10% p.a. for 2 years is…", "marks": 1, "options": [{"id": "a", "text": "₹2,100"}, {"id": "b", "text": "₹2,000"}, {"id": "c", "text": "₹2,200"}, {"id": "d", "text": "₹2,050"}]}','a'),
        ('hard','{"prompt": "A mixture has milk and water in 7:3. How much water must be added to 40 L to make the ratio 7:5?", "marks": 1, "options": [{"id": "a", "text": "8 L"}, {"id": "b", "text": "6 L"}, {"id": "c", "text": "10 L"}, {"id": "d", "text": "5 L"}]}','a')
      ) AS t(diff, content, correct)
    LOOP
      INSERT INTO public.cbt_questions (type, category_tag, difficulty, status, approved_at)
      VALUES ('mcq', 'problem_solving', r.diff::public.cbt_difficulty, 'approved', now()) RETURNING id INTO v_q;
      INSERT INTO public.cbt_question_versions (question_id, version_no, content)
      VALUES (v_q, 1, r.content::jsonb) RETURNING id INTO v_v;
      INSERT INTO public.cbt_question_keys (question_version_id, correct_option_id) VALUES (v_v, r.correct);
      UPDATE public.cbt_questions SET current_version_id = v_v WHERE id = v_q;
    END LOOP;
  END IF;
  IF (SELECT count(*) FROM public.cbt_questions WHERE category_tag = 'pattern_recognition') = 0 THEN
    FOR r IN SELECT * FROM (VALUES
        ('easy','{"prompt": "2, 4, 6, 8, ?", "marks": 1, "options": [{"id": "a", "text": "10"}, {"id": "b", "text": "9"}, {"id": "c", "text": "12"}, {"id": "d", "text": "11"}]}','a'),
        ('easy','{"prompt": "5, 10, 15, 20, ?", "marks": 1, "options": [{"id": "a", "text": "25"}, {"id": "b", "text": "24"}, {"id": "c", "text": "30"}, {"id": "d", "text": "22"}]}','a'),
        ('easy','{"prompt": "A, C, E, G, ?", "marks": 1, "options": [{"id": "a", "text": "I"}, {"id": "b", "text": "H"}, {"id": "c", "text": "J"}, {"id": "d", "text": "K"}]}','a'),
        ('easy','{"prompt": "1, 4, 9, 16, ?", "marks": 1, "options": [{"id": "a", "text": "25"}, {"id": "b", "text": "20"}, {"id": "c", "text": "24"}, {"id": "d", "text": "36"}]}','a'),
        ('easy','{"prompt": "100, 90, 80, 70, ?", "marks": 1, "options": [{"id": "a", "text": "60"}, {"id": "b", "text": "65"}, {"id": "c", "text": "55"}, {"id": "d", "text": "50"}]}','a'),
        ('easy','{"prompt": "Z, X, V, T, ?", "marks": 1, "options": [{"id": "a", "text": "R"}, {"id": "b", "text": "S"}, {"id": "c", "text": "Q"}, {"id": "d", "text": "P"}]}','a'),
        ('medium','{"prompt": "3, 6, 12, 24, ?", "marks": 1, "options": [{"id": "a", "text": "48"}, {"id": "b", "text": "36"}, {"id": "c", "text": "42"}, {"id": "d", "text": "30"}]}','a'),
        ('medium','{"prompt": "2, 3, 5, 8, 12, ?", "marks": 1, "options": [{"id": "a", "text": "17"}, {"id": "b", "text": "16"}, {"id": "c", "text": "18"}, {"id": "d", "text": "15"}]}','a'),
        ('medium','{"prompt": "B2, D4, F6, H8, ?", "marks": 1, "options": [{"id": "a", "text": "J10"}, {"id": "b", "text": "I10"}, {"id": "c", "text": "J12"}, {"id": "d", "text": "K10"}]}','a'),
        ('medium','{"prompt": "7, 14, 28, 56, ?", "marks": 1, "options": [{"id": "a", "text": "112"}, {"id": "b", "text": "84"}, {"id": "c", "text": "96"}, {"id": "d", "text": "108"}]}','a'),
        ('medium','{"prompt": "1, 1, 2, 3, 5, 8, ?", "marks": 1, "options": [{"id": "a", "text": "13"}, {"id": "b", "text": "11"}, {"id": "c", "text": "12"}, {"id": "d", "text": "10"}]}','a'),
        ('medium','{"prompt": "81, 27, 9, 3, ?", "marks": 1, "options": [{"id": "a", "text": "1"}, {"id": "b", "text": "2"}, {"id": "c", "text": "0"}, {"id": "d", "text": "1.5"}]}','a'),
        ('hard','{"prompt": "2, 6, 12, 20, 30, ?", "marks": 1, "options": [{"id": "a", "text": "42"}, {"id": "b", "text": "40"}, {"id": "c", "text": "36"}, {"id": "d", "text": "44"}]}','a'),
        ('hard','{"prompt": "11, 13, 17, 19, 23, ?", "marks": 1, "options": [{"id": "a", "text": "29"}, {"id": "b", "text": "27"}, {"id": "c", "text": "25"}, {"id": "d", "text": "31"}]}','a'),
        ('hard','{"prompt": "4, 9, 25, 49, 121, ?", "marks": 1, "options": [{"id": "a", "text": "169"}, {"id": "b", "text": "144"}, {"id": "c", "text": "196"}, {"id": "d", "text": "225"}]}','a'),
        ('hard','{"prompt": "1, 8, 27, 64, ?", "marks": 1, "options": [{"id": "a", "text": "125"}, {"id": "b", "text": "100"}, {"id": "c", "text": "216"}, {"id": "d", "text": "81"}]}','a'),
        ('hard','{"prompt": "3, 10, 29, 66, 127, ?", "marks": 1, "options": [{"id": "a", "text": "218"}, {"id": "b", "text": "196"}, {"id": "c", "text": "215"}, {"id": "d", "text": "224"}]}','a'),
        ('hard','{"prompt": "AZ, BY, CX, DW, ?", "marks": 1, "options": [{"id": "a", "text": "EV"}, {"id": "b", "text": "EU"}, {"id": "c", "text": "FV"}, {"id": "d", "text": "EX"}]}','a')
      ) AS t(diff, content, correct)
    LOOP
      INSERT INTO public.cbt_questions (type, category_tag, difficulty, status, approved_at)
      VALUES ('mcq', 'pattern_recognition', r.diff::public.cbt_difficulty, 'approved', now()) RETURNING id INTO v_q;
      INSERT INTO public.cbt_question_versions (question_id, version_no, content)
      VALUES (v_q, 1, r.content::jsonb) RETURNING id INTO v_v;
      INSERT INTO public.cbt_question_keys (question_version_id, correct_option_id) VALUES (v_v, r.correct);
      UPDATE public.cbt_questions SET current_version_id = v_v WHERE id = v_q;
    END LOOP;
  END IF;
  IF (SELECT count(*) FROM public.cbt_questions WHERE category_tag = 'grammar') = 0 THEN
    FOR r IN SELECT * FROM (VALUES
        ('easy','{"prompt": "Choose the correct sentence:", "marks": 1, "options": [{"id": "a", "text": "She goes to office daily."}, {"id": "b", "text": "She go to office daily."}, {"id": "c", "text": "She going to office daily."}, {"id": "d", "text": "She gone to office daily."}]}','a'),
        ('easy','{"prompt": "Fill in: They ___ playing cricket now.", "marks": 1, "options": [{"id": "a", "text": "are"}, {"id": "b", "text": "is"}, {"id": "c", "text": "was"}, {"id": "d", "text": "be"}]}','a'),
        ('easy','{"prompt": "Plural of \"child\" is…", "marks": 1, "options": [{"id": "a", "text": "children"}, {"id": "b", "text": "childs"}, {"id": "c", "text": "childes"}, {"id": "d", "text": "childrens"}]}','a'),
        ('easy','{"prompt": "Choose the correct article: ___ honest man.", "marks": 1, "options": [{"id": "a", "text": "An"}, {"id": "b", "text": "A"}, {"id": "c", "text": "The"}, {"id": "d", "text": "No article"}]}','a'),
        ('easy','{"prompt": "Past tense of \"bring\" is…", "marks": 1, "options": [{"id": "a", "text": "brought"}, {"id": "b", "text": "bringed"}, {"id": "c", "text": "brang"}, {"id": "d", "text": "bring"}]}','a'),
        ('easy','{"prompt": "Fill in: I have lived here ___ 2019.", "marks": 1, "options": [{"id": "a", "text": "since"}, {"id": "b", "text": "for"}, {"id": "c", "text": "from"}, {"id": "d", "text": "at"}]}','a'),
        ('medium','{"prompt": "Choose the correct sentence:", "marks": 1, "options": [{"id": "a", "text": "Neither of the answers is correct."}, {"id": "b", "text": "Neither of the answers are correct."}, {"id": "c", "text": "Neither of the answer is correct."}, {"id": "d", "text": "Neither answers is correct."}]}','a'),
        ('medium','{"prompt": "Fill in: If I ___ rich, I would travel the world.", "marks": 1, "options": [{"id": "a", "text": "were"}, {"id": "b", "text": "was"}, {"id": "c", "text": "am"}, {"id": "d", "text": "be"}]}','a'),
        ('medium','{"prompt": "Identify the error: \"One of my friend is coming today.\"", "marks": 1, "options": [{"id": "a", "text": "friend → friends"}, {"id": "b", "text": "One → A"}, {"id": "c", "text": "is → are"}, {"id": "d", "text": "No error"}]}','a'),
        ('medium','{"prompt": "Choose the correct preposition: He is good ___ mathematics.", "marks": 1, "options": [{"id": "a", "text": "at"}, {"id": "b", "text": "in"}, {"id": "c", "text": "on"}, {"id": "d", "text": "for"}]}','a'),
        ('medium','{"prompt": "Passive voice of \"She wrote a letter\":", "marks": 1, "options": [{"id": "a", "text": "A letter was written by her."}, {"id": "b", "text": "A letter is written by her."}, {"id": "c", "text": "A letter had written by her."}, {"id": "d", "text": "A letter was wrote by her."}]}','a'),
        ('medium','{"prompt": "Fill in: The manager, along with his team, ___ arrived.", "marks": 1, "options": [{"id": "a", "text": "has"}, {"id": "b", "text": "have"}, {"id": "c", "text": "are"}, {"id": "d", "text": "were"}]}','a'),
        ('hard','{"prompt": "Identify the error: \"The Ganges is one of the longest river in India.\"", "marks": 1, "options": [{"id": "a", "text": "river → rivers"}, {"id": "b", "text": "is → are"}, {"id": "c", "text": "longest → longer"}, {"id": "d", "text": "No error"}]}','a'),
        ('hard','{"prompt": "Choose the correct sentence:", "marks": 1, "options": [{"id": "a", "text": "Hardly had he arrived when the meeting began."}, {"id": "b", "text": "Hardly he had arrived when the meeting began."}, {"id": "c", "text": "Hardly had he arrived than the meeting began."}, {"id": "d", "text": "Hardly he arrived when the meeting had begun."}]}','a'),
        ('hard','{"prompt": "Fill in: No sooner did she enter ___ the phone rang.", "marks": 1, "options": [{"id": "a", "text": "than"}, {"id": "b", "text": "when"}, {"id": "c", "text": "then"}, {"id": "d", "text": "that"}]}','a'),
        ('hard','{"prompt": "Reported speech: He said, \"I will finish it tomorrow.\"", "marks": 1, "options": [{"id": "a", "text": "He said that he would finish it the next day."}, {"id": "b", "text": "He said that he will finish it tomorrow."}, {"id": "c", "text": "He said that he would finish it tomorrow."}, {"id": "d", "text": "He said that he will finish it the next day."}]}','a'),
        ('hard','{"prompt": "Choose the correct usage:", "marks": 1, "options": [{"id": "a", "text": "The committee has reached its decision."}, {"id": "b", "text": "The committee have reached its decision always."}, {"id": "c", "text": "The committee are reached its decision."}, {"id": "d", "text": "The committee has reach its decision."}]}','a'),
        ('hard','{"prompt": "Identify the correctly punctuated sentence:", "marks": 1, "options": [{"id": "a", "text": "Its raining, so take your umbrella."}, {"id": "b", "text": "It’s raining, so take your umbrella."}, {"id": "c", "text": "Its’ raining so, take your umbrella."}, {"id": "d", "text": "Its raining so take, your umbrella."}]}','b')
      ) AS t(diff, content, correct)
    LOOP
      INSERT INTO public.cbt_questions (type, category_tag, difficulty, status, approved_at)
      VALUES ('mcq', 'grammar', r.diff::public.cbt_difficulty, 'approved', now()) RETURNING id INTO v_q;
      INSERT INTO public.cbt_question_versions (question_id, version_no, content)
      VALUES (v_q, 1, r.content::jsonb) RETURNING id INTO v_v;
      INSERT INTO public.cbt_question_keys (question_version_id, correct_option_id) VALUES (v_v, r.correct);
      UPDATE public.cbt_questions SET current_version_id = v_v WHERE id = v_q;
    END LOOP;
  END IF;
  IF (SELECT count(*) FROM public.cbt_questions WHERE category_tag = 'vocabulary') = 0 THEN
    FOR r IN SELECT * FROM (VALUES
        ('easy','{"prompt": "Synonym of \"happy\":", "marks": 1, "options": [{"id": "a", "text": "joyful"}, {"id": "b", "text": "sad"}, {"id": "c", "text": "angry"}, {"id": "d", "text": "tired"}]}','a'),
        ('easy','{"prompt": "Antonym of \"begin\":", "marks": 1, "options": [{"id": "a", "text": "end"}, {"id": "b", "text": "start"}, {"id": "c", "text": "commence"}, {"id": "d", "text": "open"}]}','a'),
        ('easy','{"prompt": "Meaning of \"rapid\":", "marks": 1, "options": [{"id": "a", "text": "fast"}, {"id": "b", "text": "slow"}, {"id": "c", "text": "heavy"}, {"id": "d", "text": "late"}]}','a'),
        ('easy','{"prompt": "Synonym of \"big\":", "marks": 1, "options": [{"id": "a", "text": "large"}, {"id": "b", "text": "tiny"}, {"id": "c", "text": "narrow"}, {"id": "d", "text": "short"}]}','a'),
        ('easy','{"prompt": "Antonym of \"honest\":", "marks": 1, "options": [{"id": "a", "text": "dishonest"}, {"id": "b", "text": "truthful"}, {"id": "c", "text": "sincere"}, {"id": "d", "text": "loyal"}]}','a'),
        ('easy','{"prompt": "A person who types documents is a…", "marks": 1, "options": [{"id": "a", "text": "typist"}, {"id": "b", "text": "teacher"}, {"id": "c", "text": "tailor"}, {"id": "d", "text": "teller"}]}','a'),
        ('medium','{"prompt": "Synonym of \"diligent\":", "marks": 1, "options": [{"id": "a", "text": "hardworking"}, {"id": "b", "text": "lazy"}, {"id": "c", "text": "clever"}, {"id": "d", "text": "quick"}]}','a'),
        ('medium','{"prompt": "Antonym of \"expand\":", "marks": 1, "options": [{"id": "a", "text": "contract"}, {"id": "b", "text": "extend"}, {"id": "c", "text": "enlarge"}, {"id": "d", "text": "spread"}]}','a'),
        ('medium','{"prompt": "Meaning of \"candid\":", "marks": 1, "options": [{"id": "a", "text": "frank"}, {"id": "b", "text": "secretive"}, {"id": "c", "text": "rude"}, {"id": "d", "text": "clever"}]}','a'),
        ('medium','{"prompt": "Synonym of \"abbreviate\":", "marks": 1, "options": [{"id": "a", "text": "shorten"}, {"id": "b", "text": "lengthen"}, {"id": "c", "text": "explain"}, {"id": "d", "text": "write"}]}','a'),
        ('medium','{"prompt": "Antonym of \"transparent\":", "marks": 1, "options": [{"id": "a", "text": "opaque"}, {"id": "b", "text": "clear"}, {"id": "c", "text": "obvious"}, {"id": "d", "text": "thin"}]}','a'),
        ('medium','{"prompt": "\"To reconcile\" two accounts means to…", "marks": 1, "options": [{"id": "a", "text": "make them agree"}, {"id": "b", "text": "close them"}, {"id": "c", "text": "open them"}, {"id": "d", "text": "transfer funds"}]}','a'),
        ('hard','{"prompt": "Synonym of \"meticulous\":", "marks": 1, "options": [{"id": "a", "text": "thorough"}, {"id": "b", "text": "careless"}, {"id": "c", "text": "hasty"}, {"id": "d", "text": "vague"}]}','a'),
        ('hard','{"prompt": "Antonym of \"frugal\":", "marks": 1, "options": [{"id": "a", "text": "extravagant"}, {"id": "b", "text": "thrifty"}, {"id": "c", "text": "stingy"}, {"id": "d", "text": "prudent"}]}','a'),
        ('hard','{"prompt": "Meaning of \"ubiquitous\":", "marks": 1, "options": [{"id": "a", "text": "present everywhere"}, {"id": "b", "text": "very rare"}, {"id": "c", "text": "extremely old"}, {"id": "d", "text": "hard to find"}]}','a'),
        ('hard','{"prompt": "Synonym of \"exonerate\":", "marks": 1, "options": [{"id": "a", "text": "acquit"}, {"id": "b", "text": "blame"}, {"id": "c", "text": "accuse"}, {"id": "d", "text": "punish"}]}','a'),
        ('hard','{"prompt": "Antonym of \"benevolent\":", "marks": 1, "options": [{"id": "a", "text": "malevolent"}, {"id": "b", "text": "kind"}, {"id": "c", "text": "generous"}, {"id": "d", "text": "gentle"}]}','a'),
        ('hard','{"prompt": "Meaning of \"pragmatic\":", "marks": 1, "options": [{"id": "a", "text": "practical"}, {"id": "b", "text": "idealistic"}, {"id": "c", "text": "emotional"}, {"id": "d", "text": "careless"}]}','a')
      ) AS t(diff, content, correct)
    LOOP
      INSERT INTO public.cbt_questions (type, category_tag, difficulty, status, approved_at)
      VALUES ('mcq', 'vocabulary', r.diff::public.cbt_difficulty, 'approved', now()) RETURNING id INTO v_q;
      INSERT INTO public.cbt_question_versions (question_id, version_no, content)
      VALUES (v_q, 1, r.content::jsonb) RETURNING id INTO v_v;
      INSERT INTO public.cbt_question_keys (question_version_id, correct_option_id) VALUES (v_v, r.correct);
      UPDATE public.cbt_questions SET current_version_id = v_v WHERE id = v_q;
    END LOOP;
  END IF;
END $$;

-- Add the five skills to the demo role blueprint (intermediate level, 6 questions, 5 minutes each).
DO $$
DECLARE
  v_role uuid;
  v_next int;
  s text;
BEGIN
  SELECT id INTO v_role FROM public.cbt_job_roles WHERE code = 'OPR' LIMIT 1;
  IF v_role IS NULL THEN RETURN; END IF;
  FOREACH s IN ARRAY ARRAY['logical_reasoning','problem_solving','pattern_recognition','grammar','vocabulary'] LOOP
    IF NOT EXISTS (SELECT 1 FROM public.cbt_role_sections WHERE job_role_id = v_role AND section_type = s::public.cbt_section_type) THEN
      SELECT COALESCE(max(order_index), 0) + 1 INTO v_next FROM public.cbt_role_sections WHERE job_role_id = v_role;
      INSERT INTO public.cbt_role_sections (job_role_id, order_index, section_code, section_type, title, category_tags, item_count, duration_seconds, weight, negative_mark, skill_level)
      VALUES (v_role, v_next, upper(s), s::public.cbt_section_type, initcap(replace(s, '_', ' ')), ARRAY[s], 6, 300, 10, 0, 'intermediate');
    END IF;
  END LOOP;
END $$;