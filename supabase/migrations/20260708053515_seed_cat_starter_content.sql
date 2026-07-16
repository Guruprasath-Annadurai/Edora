-- Original, hand-authored CAT-style practice questions (NOT verbatim past
-- papers — those are IIM copyrighted material). Starter set only, clearly a
-- smaller pool than the JEE/NEET "10 years of PYQs" depth; more to be added.
insert into public.pyq_content (exam, year, subject, chapter, question_text, solution_text, options, correct_option, question_type, difficulty, marks) values

-- QA (Quantitative Aptitude)
('CAT', 2026, 'QA', 'Profit & Loss', 'A shopkeeper marks up an item by 40% above cost price and then gives a discount of 25% on the marked price. What is the shopkeeper''s profit percentage?',
 'CP=100, MP=140, SP=140*0.75=105. Profit = 5%.',
 '[{"label":"A","text":"5%","correct":true},{"label":"B","text":"10%","correct":false},{"label":"C","text":"15%","correct":false},{"label":"D","text":"20%","correct":false}]',
 'A', 'mcq', 'medium', 3),

('CAT', 2026, 'QA', 'Number System', 'The sum of three consecutive even integers is 90. Find the largest integer.',
 'n + n+2 + n+4 = 90 → 3n+6=90 → n=28. Largest = 32.',
 '[]', '32', 'integer', 'medium', 3),

('CAT', 2026, 'QA', 'Algebra', 'If x + 1/x = 4, what is the value of x^3 + 1/x^3?',
 'x^2+1/x^2 = 4^2-2=14. x^3+1/x^3 = (x+1/x)(x^2-1+1/x^2) = 4*(14-1) = 52.',
 '[{"label":"A","text":"40","correct":false},{"label":"B","text":"44","correct":false},{"label":"C","text":"52","correct":true},{"label":"D","text":"64","correct":false}]',
 'C', 'mcq', 'hard', 3),

('CAT', 2026, 'QA', 'Time Speed Distance', 'A train travels 360 km at a uniform speed. If the speed had been 5 km/h more, it would have taken 1 hour less for the same journey. Find the original speed in km/h.',
 '360/s - 360/(s+5) = 1 → s^2+5s-1800=0 → s=40 (taking positive root).',
 '[]', '40', 'integer', 'hard', 3),

('CAT', 2026, 'QA', 'Percentages', 'What is 15% of 15% of 4000?',
 '15% of 4000 = 600; 15% of 600 = 90.',
 '[{"label":"A","text":"60","correct":false},{"label":"B","text":"75","correct":false},{"label":"C","text":"90","correct":true},{"label":"D","text":"120","correct":false}]',
 'C', 'mcq', 'easy', 3),

('CAT', 2026, 'QA', 'Averages', 'The average of 5 consecutive odd numbers is 61. What is the largest number?',
 'Average of 5 consecutive odds = middle number = 61. Largest = 61+4 = 65.',
 '[{"label":"A","text":"61","correct":false},{"label":"B","text":"63","correct":false},{"label":"C","text":"65","correct":true},{"label":"D","text":"67","correct":false}]',
 'C', 'mcq', 'medium', 3),

('CAT', 2026, 'QA', 'Time & Work', 'A can complete a work in 12 days, B in 15 days. They work together for 4 days, then A leaves. In how many more days will B complete the remaining work?',
 'Combined rate = 1/12+1/15 = 3/20 per day. In 4 days: 3/5 done. Remaining 2/5. B alone: (2/5)/(1/15) = 6 days.',
 '[]', '6', 'integer', 'medium', 3),

('CAT', 2026, 'QA', 'Permutation & Combination', 'In how many ways can the letters of the word ''LEADER'' be arranged?',
 'LEADER has 6 letters with E repeating twice. Arrangements = 6!/2! = 360.',
 '[{"label":"A","text":"360","correct":true},{"label":"B","text":"720","correct":false},{"label":"C","text":"180","correct":false},{"label":"D","text":"240","correct":false}]',
 'A', 'mcq', 'hard', 3),

-- DILR (Data Interpretation & Logical Reasoning)
('CAT', 2026, 'DILR', 'Coding-Decoding', 'In a certain code, ''MOUNTAIN'' is written as ''NPVOUBJO'' (each letter shifted by +1 in the alphabet). How is ''RIVER'' written in the same code?',
 'Shift each letter +1: R→S, I→J, V→W, E→F, R→S → SJWFS.',
 '[{"label":"A","text":"SJWFS","correct":true},{"label":"B","text":"SJVFS","correct":false},{"label":"C","text":"TJWFS","correct":false},{"label":"D","text":"SJWFT","correct":false}]',
 'A', 'mcq', 'easy', 3),

('CAT', 2026, 'DILR', 'Blood Relations', 'Pointing to a photograph, Rohan said, ''She is the daughter of my grandfather''s only son.'' How is the girl in the photograph related to Rohan?',
 'Grandfather''s only son = Rohan''s father. Daughter of Rohan''s father = Rohan''s sister.',
 '[{"label":"A","text":"Sister","correct":true},{"label":"B","text":"Cousin","correct":false},{"label":"C","text":"Daughter","correct":false},{"label":"D","text":"Niece","correct":false}]',
 'A', 'mcq', 'medium', 3),

('CAT', 2026, 'DILR', 'Direction Sense', 'A man walks 5 km North, then turns right and walks 3 km, then turns right again and walks 5 km. How far is he from his starting point and in which direction?',
 'North 5, then East 3 (turn right), then South 5 (turn right) — the two 5 km legs cancel vertically, leaving 3 km East.',
 '[{"label":"A","text":"3 km East","correct":true},{"label":"B","text":"5 km East","correct":false},{"label":"C","text":"3 km West","correct":false},{"label":"D","text":"8 km North","correct":false}]',
 'A', 'mcq', 'medium', 3),

('CAT', 2026, 'DILR', 'Syllogism', 'Statements: All pens are books. Some books are pencils. Conclusions: I. Some pencils are pens. II. All books are pens. Which conclusion follows?',
 'Neither conclusion necessarily follows from the given statements — classic syllogism trap.',
 '[{"label":"A","text":"Only I follows","correct":false},{"label":"B","text":"Only II follows","correct":false},{"label":"C","text":"Both follow","correct":false},{"label":"D","text":"Neither follows","correct":true}]',
 'D', 'mcq', 'medium', 3),

('CAT', 2026, 'DILR', 'Seating Arrangement', 'Five friends A, B, C, D, E sit in a row facing north, at positions 1 to 5 (left to right). B sits at position 3. A sits immediately to the right of B. D does not sit at either end. E sits at position 1. Who sits at position 5?',
 'Positions: 1=E, 3=B, 4=A. Remaining 2,5 for C,D. D cannot be at an end, so D=2, C=5.',
 '[{"label":"A","text":"A","correct":false},{"label":"B","text":"B","correct":false},{"label":"C","text":"C","correct":true},{"label":"D","text":"D","correct":false}]',
 'C', 'mcq', 'hard', 3),

('CAT', 2026, 'DILR', 'Number Series', 'Find the next number in the series: 2, 6, 12, 20, 30, ?',
 'Differences: 4,6,8,10 → next difference 12 → 30+12=42.',
 '[{"label":"A","text":"40","correct":false},{"label":"B","text":"42","correct":true},{"label":"C","text":"44","correct":false},{"label":"D","text":"36","correct":false}]',
 'B', 'mcq', 'easy', 3),

('CAT', 2026, 'DILR', 'Coding', 'If A=1, B=2, ... Z=26, what is the sum of the numeric values of the letters in ''CAT''?',
 'C=3, A=1, T=20. Sum = 24.',
 '[{"label":"A","text":"20","correct":false},{"label":"B","text":"22","correct":false},{"label":"C","text":"24","correct":true},{"label":"D","text":"26","correct":false}]',
 'C', 'mcq', 'medium', 3),

('CAT', 2026, 'DILR', 'Logical Deduction', 'In a family, there are two fathers and two sons. They have $30 to share equally, and the family consists of only 3 people. How much does each person get?',
 'Grandfather, father, and son = 2 fathers (grandfather & father) + 2 sons (father & son), 3 people total. 30/3=10 each.',
 '[{"label":"A","text":"$10","correct":true},{"label":"B","text":"$15","correct":false},{"label":"C","text":"$6","correct":false},{"label":"D","text":"$30","correct":false}]',
 'A', 'mcq', 'medium', 3),

-- VARC (Verbal Ability & Reading Comprehension)
('CAT', 2026, 'VARC', 'Reading Comprehension', 'Passage: "Renewable energy sources like solar and wind are increasingly cost-competitive with fossil fuels. However, their intermittent nature requires significant investment in storage technology to ensure grid reliability." According to the passage, what is a key challenge of renewable energy?',
 'The passage explicitly states intermittency requires storage investment for grid reliability.',
 '[{"label":"A","text":"High initial cost","correct":false},{"label":"B","text":"Intermittent supply requiring storage investment","correct":true},{"label":"C","text":"Lack of public support","correct":false},{"label":"D","text":"Government regulation","correct":false}]',
 'B', 'mcq', 'medium', 3),

('CAT', 2026, 'VARC', 'Para-jumble', 'Arrange in logical order: 1) This process, called photosynthesis, sustains most life on Earth. 2) Plants convert sunlight into chemical energy. 3) They use this energy to produce glucose from carbon dioxide and water. Which is the correct order?',
 'Logical flow: plants convert sunlight (2) → use it to produce glucose (3) → this process is named photosynthesis (1).',
 '[{"label":"A","text":"1-2-3","correct":false},{"label":"B","text":"2-3-1","correct":true},{"label":"C","text":"3-2-1","correct":false},{"label":"D","text":"2-1-3","correct":false}]',
 'B', 'mcq', 'medium', 3),

('CAT', 2026, 'VARC', 'Vocabulary', 'Choose the word most similar in meaning to ''ephemeral'':',
 '''Ephemeral'' means short-lived or fleeting.',
 '[{"label":"A","text":"Eternal","correct":false},{"label":"B","text":"Fleeting","correct":true},{"label":"C","text":"Massive","correct":false},{"label":"D","text":"Ancient","correct":false}]',
 'B', 'mcq', 'easy', 3),

('CAT', 2026, 'VARC', 'Analogy', '''BOOK is to READ as FOOD is to'':',
 'A book is meant to be read; food is meant to be eaten.',
 '[{"label":"A","text":"Cook","correct":false},{"label":"B","text":"Eat","correct":true},{"label":"C","text":"Kitchen","correct":false},{"label":"D","text":"Plate","correct":false}]',
 'B', 'mcq', 'medium', 3),

('CAT', 2026, 'VARC', 'Critical Reasoning', 'Passage: "All successful entrepreneurs take risks. Rahul took a big risk investing in his startup. Therefore, Rahul is a successful entrepreneur." What is the flaw in this reasoning?',
 'This affirms the consequent — taking risks is necessary but not sufficient for being a successful entrepreneur; the argument wrongly assumes all risk-takers are successful entrepreneurs.',
 '[{"label":"A","text":"It assumes all risk-takers are successful entrepreneurs, which does not follow from the premise","correct":true},{"label":"B","text":"It uses circular reasoning","correct":false},{"label":"C","text":"It has a false premise","correct":false},{"label":"D","text":"It is a valid argument","correct":false}]',
 'A', 'mcq', 'medium', 3),

('CAT', 2026, 'VARC', 'Grammar Usage', 'The committee ___ its decision after much deliberation.',
 '''Committee'' is a collective noun treated as singular here, so the verb takes the singular past form ''announced''.',
 '[{"label":"A","text":"announce","correct":false},{"label":"B","text":"announced","correct":true},{"label":"C","text":"announcing","correct":false},{"label":"D","text":"announces","correct":false}]',
 'B', 'mcq', 'easy', 3),

('CAT', 2026, 'VARC', 'Odd One Out', 'Choose the word that does not belong with the others:',
 'Sonata, Symphony, and Concerto are musical composition forms; Sculpture is a visual art form.',
 '[{"label":"A","text":"Sonata","correct":false},{"label":"B","text":"Symphony","correct":false},{"label":"C","text":"Concerto","correct":false},{"label":"D","text":"Sculpture","correct":true}]',
 'D', 'mcq', 'easy', 3),

('CAT', 2026, 'VARC', 'Reading Comprehension', 'Passage: "Despite initial skepticism, remote work has proven to increase productivity for many roles, though it poses challenges for collaborative, creative tasks that benefit from in-person spontaneity." The passage suggests remote work is:',
 'The passage presents a balanced view — productive for many roles, but challenging for collaborative creative tasks — i.e. beneficial for some tasks, not others.',
 '[{"label":"A","text":"Universally beneficial","correct":false},{"label":"B","text":"Beneficial for some tasks but not others","correct":true},{"label":"C","text":"Harmful to productivity","correct":false},{"label":"D","text":"Only suitable for creative work","correct":false}]',
 'B', 'mcq', 'medium', 3);
