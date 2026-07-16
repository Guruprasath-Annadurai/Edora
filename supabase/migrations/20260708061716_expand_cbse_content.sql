insert into public.pyq_content (exam, year, subject, chapter, question_text, solution_text, options, correct_option, question_type, difficulty, marks, class_level) values

('BOARDS', 2026, 'Maths', 'Polynomials', 'The zeroes of the polynomial x^2 - 3x - 10 are:',
 'Factoring: x^2 - 3x - 10 = (x-5)(x+2) = 0, so x = 5 or x = -2.',
 '[{"label":"A","text":"5 and -2","correct":true},{"label":"B","text":"5 and 2","correct":false},{"label":"C","text":"-5 and 2","correct":false},{"label":"D","text":"-5 and -2","correct":false}]',
 'A', 'mcq', 'medium', 1, '10'),

('BOARDS', 2026, 'Science', 'Cell Biology', 'Which organelle is known as the ''powerhouse of the cell''?',
 'Mitochondria generate ATP through cellular respiration, earning the nickname ''powerhouse of the cell''.',
 '[{"label":"A","text":"Mitochondria","correct":true},{"label":"B","text":"Nucleus","correct":false},{"label":"C","text":"Ribosome","correct":false},{"label":"D","text":"Golgi body","correct":false}]',
 'A', 'mcq', 'easy', 1, '10'),

('BOARDS', 2026, 'Social Science', 'History', 'The Battle of Plassey was fought in which year?',
 'The Battle of Plassey was fought in 1757, establishing British East India Company control over Bengal.',
 '[{"label":"A","text":"1757","correct":true},{"label":"B","text":"1764","correct":false},{"label":"C","text":"1857","correct":false},{"label":"D","text":"1748","correct":false}]',
 'A', 'mcq', 'medium', 1, '10'),

('BOARDS', 2026, 'Maths', 'Areas Related to Circles', 'If the perimeter of a circle equals the perimeter of a square, the ratio of the circle''s area to the square''s area is:',
 'With 4a = 2πr, a = πr/2. Area ratio = πr² / (πr/2)² = 4/π ≈ 4/(22/7) = 14/11.',
 '[{"label":"A","text":"14:11","correct":true},{"label":"B","text":"11:14","correct":false},{"label":"C","text":"22:7","correct":false},{"label":"D","text":"7:22","correct":false}]',
 'A', 'mcq', 'hard', 1, '10'),

('BOARDS', 2026, 'Physics', 'Magnetism', 'The SI unit of magnetic flux is:',
 'The Weber (Wb) is the SI unit of magnetic flux.',
 '[{"label":"A","text":"Weber","correct":true},{"label":"B","text":"Tesla","correct":false},{"label":"C","text":"Henry","correct":false},{"label":"D","text":"Farad","correct":false}]',
 'A', 'mcq', 'medium', 1, '12'),

('BOARDS', 2026, 'Chemistry', 'Electrochemistry', 'Which of the following is a strong electrolyte?',
 'NaCl fully dissociates into ions in solution, making it a strong electrolyte, unlike weak acids/bases like CH3COOH or NH4OH.',
 '[{"label":"A","text":"NaCl","correct":true},{"label":"B","text":"CH3COOH","correct":false},{"label":"C","text":"NH4OH","correct":false},{"label":"D","text":"HF","correct":false}]',
 'A', 'mcq', 'medium', 1, '12'),

('BOARDS', 2026, 'Biology', 'Human Physiology', 'The blood group AB is called the universal ______ because it can receive blood from any group.',
 'AB blood group individuals can receive red blood cells from any ABO group, making them universal recipients.',
 '[{"label":"A","text":"Recipient","correct":true},{"label":"B","text":"Donor","correct":false},{"label":"C","text":"Neutral","correct":false},{"label":"D","text":"Carrier","correct":false}]',
 'A', 'mcq', 'easy', 1, '12'),

('BOARDS', 2026, 'Maths', 'Integrals', 'The value of the definite integral of sin(x) from 0 to π/2 is:',
 '∫sin(x)dx = -cos(x). Evaluated from 0 to π/2: -cos(π/2) + cos(0) = 0 + 1 = 1.',
 '[{"label":"A","text":"1","correct":true},{"label":"B","text":"0","correct":false},{"label":"C","text":"-1","correct":false},{"label":"D","text":"π/2","correct":false}]',
 'A', 'mcq', 'medium', 1, '12');
