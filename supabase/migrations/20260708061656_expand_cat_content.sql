insert into public.pyq_content (exam, year, subject, chapter, question_text, solution_text, options, correct_option, question_type, difficulty, marks) values

('CAT', 2026, 'QA', 'Simple Interest', 'A sum of money doubles itself in 8 years at simple interest. In how many years will it become 4 times itself?',
 'Doubling in 8 years at SI means rate = 12.5%/year. To become 4x (interest = 3P), time = 3P / (P × 0.125) = 24 years.',
 '[{"label":"A","text":"16","correct":false},{"label":"B","text":"20","correct":false},{"label":"C","text":"24","correct":true},{"label":"D","text":"32","correct":false}]',
 'C', 'mcq', 'medium', 3),

('CAT', 2026, 'QA', 'Percentages', 'Find the value of 15% of 40% of 500.',
 '40% of 500 = 200. 15% of 200 = 30.',
 '[]', '30', 'integer', 'easy', 3),

('CAT', 2026, 'QA', 'Compound Interest', 'The compound interest on Rs 10,000 for 2 years at 10% per annum compounded annually is:',
 'CI = P[(1+r)^n - 1] = 10000[(1.1)^2 - 1] = 10000 × 0.21 = 2100.',
 '[{"label":"A","text":"2000","correct":false},{"label":"B","text":"2100","correct":true},{"label":"C","text":"2200","correct":false},{"label":"D","text":"1900","correct":false}]',
 'B', 'mcq', 'hard', 3),

('CAT', 2026, 'DILR', 'Blood Relations', 'If ''A is the brother of B'', ''B is the sister of C'', and ''C is the son of D'', how is A related to D?',
 'A, B, and C are all children of D. Since A is specified as the brother, A is D''s son.',
 '[{"label":"A","text":"Son","correct":true},{"label":"B","text":"Grandson","correct":false},{"label":"C","text":"Nephew","correct":false},{"label":"D","text":"Brother","correct":false}]',
 'A', 'mcq', 'medium', 3),

('CAT', 2026, 'DILR', 'Syllogism', 'Statements: All doctors are engineers. All engineers are teachers. Conclusion: All doctors are teachers. Is the conclusion valid?',
 'By transitivity, if all doctors are engineers and all engineers are teachers, then all doctors are teachers — the conclusion is valid.',
 '[{"label":"A","text":"Valid","correct":true},{"label":"B","text":"Invalid","correct":false},{"label":"C","text":"Cannot be determined","correct":false},{"label":"D","text":"Partially valid","correct":false}]',
 'A', 'mcq', 'medium', 3),

('CAT', 2026, 'DILR', 'Coding-Decoding', 'In a certain code, ''PAPER'' is written as ''QCSIW'' (letters shifted by +1,+2,+3,+4,+5 respectively). How is ''BOOK'' written applying the same +1,+2,+3,+4 shift pattern?',
 'B+1=C, O+2=Q, O+3=R, K+4=O → CQRO.',
 '[{"label":"A","text":"CQRO","correct":true},{"label":"B","text":"CPRO","correct":false},{"label":"C","text":"DQRO","correct":false},{"label":"D","text":"CQSP","correct":false}]',
 'A', 'mcq', 'hard', 3),

('CAT', 2026, 'VARC', 'Reading Comprehension', 'Passage: "Artificial intelligence, while transformative, raises significant ethical questions about bias, accountability, and the displacement of human labor that policymakers are only beginning to address." The author''s tone toward AI can best be described as:',
 'The passage acknowledges AI''s transformative potential while raising real concerns — a balanced, not one-sided, tone.',
 '[{"label":"A","text":"Uncritically enthusiastic","correct":false},{"label":"B","text":"Balanced, acknowledging both promise and concern","correct":true},{"label":"C","text":"Dismissive","correct":false},{"label":"D","text":"Alarmist","correct":false}]',
 'B', 'mcq', 'medium', 3),

('CAT', 2026, 'VARC', 'Vocabulary', 'Choose the correctly spelled word:',
 '''Occasion'' is the correct spelling.',
 '[{"label":"A","text":"Occassion","correct":false},{"label":"B","text":"Occasion","correct":true},{"label":"C","text":"Ocassion","correct":false},{"label":"D","text":"Occaision","correct":false}]',
 'B', 'mcq', 'easy', 3);
