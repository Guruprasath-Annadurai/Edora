-- Original, fact-checked CBSE board-style MCQs (Class 10 + Class 12) — not
-- verbatim real CBSE PYQs (copyrighted), same discipline as CAT/UPSC content.
insert into public.pyq_content (exam, year, subject, chapter, question_text, solution_text, options, correct_option, question_type, difficulty, marks, class_level) values

-- Class 10 — Maths
('BOARDS', 2026, 'Maths', 'Quadratic Equations', 'What is the value of the discriminant of the quadratic equation 2x^2 - 4x + 1 = 0?',
 'Discriminant = b^2 - 4ac = (-4)^2 - 4(2)(1) = 16 - 8 = 8.',
 '[{"label":"A","text":"8","correct":true},{"label":"B","text":"4","correct":false},{"label":"C","text":"16","correct":false},{"label":"D","text":"0","correct":false}]',
 'A', 'mcq', 'medium', 1, '10'),

('BOARDS', 2026, 'Maths', 'Pair of Linear Equations', 'The pair of linear equations x + y = 5 and 2x + 2y = 10 has:',
 'The second equation is exactly double the first, representing the same line — so there are infinitely many solutions.',
 '[{"label":"A","text":"A unique solution","correct":false},{"label":"B","text":"No solution","correct":false},{"label":"C","text":"Infinitely many solutions","correct":true},{"label":"D","text":"Exactly two solutions","correct":false}]',
 'C', 'mcq', 'medium', 1, '10'),

('BOARDS', 2026, 'Maths', 'Arithmetic Progressions', 'The sum of the first 10 natural numbers is:',
 'Sum = n(n+1)/2 = 10(11)/2 = 55.',
 '[{"label":"A","text":"55","correct":true},{"label":"B","text":"50","correct":false},{"label":"C","text":"45","correct":false},{"label":"D","text":"60","correct":false}]',
 'A', 'mcq', 'easy', 1, '10'),

('BOARDS', 2026, 'Maths', 'Triangles', 'In a right triangle, if one acute angle is 30°, what is the other acute angle?',
 'Angles of a triangle sum to 180°; with one angle 90° and another 30°, the third is 180-90-30=60°.',
 '[{"label":"A","text":"60°","correct":true},{"label":"B","text":"45°","correct":false},{"label":"C","text":"50°","correct":false},{"label":"D","text":"70°","correct":false}]',
 'A', 'mcq', 'easy', 1, '10'),

-- Class 10 — Science
('BOARDS', 2026, 'Science', 'Chemical Reactions', 'Which gas is evolved when dilute hydrochloric acid reacts with zinc granules?',
 'Zinc reacts with dilute HCl to produce zinc chloride and hydrogen gas: Zn + 2HCl → ZnCl2 + H2.',
 '[{"label":"A","text":"Hydrogen","correct":true},{"label":"B","text":"Oxygen","correct":false},{"label":"C","text":"Carbon dioxide","correct":false},{"label":"D","text":"Nitrogen","correct":false}]',
 'A', 'mcq', 'easy', 1, '10'),

('BOARDS', 2026, 'Science', 'Life Processes', 'The functional unit of the kidney is called:',
 'The nephron is the structural and functional unit of the kidney, responsible for filtering blood and forming urine.',
 '[{"label":"A","text":"Nephron","correct":true},{"label":"B","text":"Neuron","correct":false},{"label":"C","text":"Alveolus","correct":false},{"label":"D","text":"Glomerulus","correct":false}]',
 'A', 'mcq', 'medium', 1, '10'),

('BOARDS', 2026, 'Science', 'Light', 'Which type of mirror is used as a rear-view mirror in vehicles?',
 'Convex mirrors are used because they give a wider field of view, always producing a diminished, virtual image.',
 '[{"label":"A","text":"Convex mirror","correct":true},{"label":"B","text":"Concave mirror","correct":false},{"label":"C","text":"Plane mirror","correct":false},{"label":"D","text":"Cylindrical mirror","correct":false}]',
 'A', 'mcq', 'easy', 1, '10'),

('BOARDS', 2026, 'Science', 'Life Processes', 'The process by which green plants prepare their own food is called:',
 'Photosynthesis is the process by which green plants use sunlight, water, and carbon dioxide to produce glucose and oxygen.',
 '[{"label":"A","text":"Photosynthesis","correct":true},{"label":"B","text":"Respiration","correct":false},{"label":"C","text":"Transpiration","correct":false},{"label":"D","text":"Excretion","correct":false}]',
 'A', 'mcq', 'easy', 1, '10'),

-- Class 10 — Social Science
('BOARDS', 2026, 'Social Science', 'Nationalism in India', 'The Non-Cooperation Movement was launched by Mahatma Gandhi in which year?',
 'The Non-Cooperation Movement was launched in 1920.',
 '[{"label":"A","text":"1920","correct":true},{"label":"B","text":"1930","correct":false},{"label":"C","text":"1942","correct":false},{"label":"D","text":"1919","correct":false}]',
 'A', 'mcq', 'medium', 1, '10'),

('BOARDS', 2026, 'Social Science', 'History', 'Mohenjo-daro was a major city of which ancient civilization?',
 'Mohenjo-daro was a major urban center of the Indus Valley Civilization.',
 '[{"label":"A","text":"Indus Valley Civilization","correct":true},{"label":"B","text":"Mesopotamian Civilization","correct":false},{"label":"C","text":"Egyptian Civilization","correct":false},{"label":"D","text":"Nile Valley Civilization","correct":false}]',
 'A', 'mcq', 'easy', 1, '10'),

('BOARDS', 2026, 'Social Science', 'Economics', 'What is the term for the total value of goods and services produced within a country in a year?',
 'GDP (Gross Domestic Product) measures the total value of goods and services produced within a country''s borders in a year.',
 '[{"label":"A","text":"GDP","correct":true},{"label":"B","text":"GNP","correct":false},{"label":"C","text":"Per Capita Income","correct":false},{"label":"D","text":"Inflation","correct":false}]',
 'A', 'mcq', 'medium', 1, '10'),

('BOARDS', 2026, 'Social Science', 'Civics', 'Which fundamental right guarantees equality before the law in India?',
 'The Right to Equality (Articles 14-18) guarantees equality before the law and equal protection of laws.',
 '[{"label":"A","text":"Right to Equality","correct":true},{"label":"B","text":"Right to Freedom","correct":false},{"label":"C","text":"Right to Constitutional Remedies","correct":false},{"label":"D","text":"Right against Exploitation","correct":false}]',
 'A', 'mcq', 'medium', 1, '10'),

-- Class 12 — Physics
('BOARDS', 2026, 'Physics', 'Current Electricity', 'The SI unit of electric resistance is:',
 'The SI unit of electrical resistance is the Ohm (Ω).',
 '[{"label":"A","text":"Ohm","correct":true},{"label":"B","text":"Volt","correct":false},{"label":"C","text":"Ampere","correct":false},{"label":"D","text":"Watt","correct":false}]',
 'A', 'mcq', 'easy', 1, '12'),

('BOARDS', 2026, 'Physics', 'Electromagnetic Induction', 'According to Lenz''s law, the direction of induced current opposes:',
 'Lenz''s law states that the induced current always flows in a direction that opposes the change in magnetic flux that produced it.',
 '[{"label":"A","text":"The change in magnetic flux that produced it","correct":true},{"label":"B","text":"The applied EMF","correct":false},{"label":"C","text":"The direction of current flow","correct":false},{"label":"D","text":"The resistance of the circuit","correct":false}]',
 'A', 'mcq', 'medium', 1, '12'),

('BOARDS', 2026, 'Physics', 'Wave Optics', 'The phenomenon of bending of light around obstacles is called:',
 'Diffraction is the bending of light waves around obstacles or through small apertures.',
 '[{"label":"A","text":"Diffraction","correct":true},{"label":"B","text":"Refraction","correct":false},{"label":"C","text":"Reflection","correct":false},{"label":"D","text":"Polarization","correct":false}]',
 'A', 'mcq', 'medium', 1, '12'),

-- Class 12 — Chemistry
('BOARDS', 2026, 'Chemistry', 'Haloalkanes and Haloarenes', 'Which of the following is an example of a nucleophile?',
 'The hydroxide ion (OH⁻) is electron-rich and donates an electron pair, making it a nucleophile.',
 '[{"label":"A","text":"OH⁻","correct":true},{"label":"B","text":"H⁺","correct":false},{"label":"C","text":"NO2⁺","correct":false},{"label":"D","text":"Br⁺","correct":false}]',
 'A', 'mcq', 'medium', 1, '12'),

('BOARDS', 2026, 'Chemistry', 'Alcohols, Phenols and Ethers', 'The IUPAC name of CH3-CH2-OH is:',
 'CH3-CH2-OH is ethanol, a two-carbon alcohol.',
 '[{"label":"A","text":"Ethanol","correct":true},{"label":"B","text":"Methanol","correct":false},{"label":"C","text":"Ethanal","correct":false},{"label":"D","text":"Ethanoic acid","correct":false}]',
 'A', 'mcq', 'easy', 1, '12'),

('BOARDS', 2026, 'Chemistry', 'Solid State / Bonding', 'Which of the following has the highest boiling point due to hydrogen bonding?',
 'Water has an unusually high boiling point due to extensive hydrogen bonding between molecules.',
 '[{"label":"A","text":"Water","correct":true},{"label":"B","text":"Methane","correct":false},{"label":"C","text":"Hydrogen sulfide","correct":false},{"label":"D","text":"Carbon dioxide","correct":false}]',
 'A', 'mcq', 'easy', 1, '12'),

-- Class 12 — Biology
('BOARDS', 2026, 'Biology', 'Chemical Coordination', 'Which hormone is responsible for the ''fight or flight'' response?',
 'Adrenaline (epinephrine), secreted by the adrenal medulla, triggers the fight-or-flight response.',
 '[{"label":"A","text":"Adrenaline","correct":true},{"label":"B","text":"Insulin","correct":false},{"label":"C","text":"Thyroxine","correct":false},{"label":"D","text":"Estrogen","correct":false}]',
 'A', 'mcq', 'easy', 1, '12'),

('BOARDS', 2026, 'Biology', 'Molecular Basis of Inheritance', 'DNA replication is described as semi-conservative because:',
 'Each daughter DNA molecule retains one original (parental) strand and synthesizes one new complementary strand.',
 '[{"label":"A","text":"Each daughter molecule has one old strand and one new strand","correct":true},{"label":"B","text":"Both strands are entirely new","correct":false},{"label":"C","text":"Both strands are entirely old","correct":false},{"label":"D","text":"One molecule is entirely new","correct":false}]',
 'A', 'mcq', 'hard', 1, '12'),

('BOARDS', 2026, 'Biology', 'Reproduction', 'The process of formation of gametes is called:',
 'Gametogenesis is the general process of gamete formation, encompassing both spermatogenesis (sperm) and oogenesis (egg).',
 '[{"label":"A","text":"Gametogenesis","correct":true},{"label":"B","text":"Spermatogenesis","correct":false},{"label":"C","text":"Oogenesis","correct":false},{"label":"D","text":"Fertilization","correct":false}]',
 'A', 'mcq', 'medium', 1, '12'),

-- Class 12 — Maths
('BOARDS', 2026, 'Maths', 'Continuity and Differentiability', 'The derivative of sin(x) with respect to x is:',
 'd/dx[sin(x)] = cos(x).',
 '[{"label":"A","text":"cos(x)","correct":true},{"label":"B","text":"-cos(x)","correct":false},{"label":"C","text":"-sin(x)","correct":false},{"label":"D","text":"tan(x)","correct":false}]',
 'A', 'mcq', 'easy', 1, '12'),

('BOARDS', 2026, 'Maths', 'Probability', 'If A and B are independent events with P(A)=0.4 and P(B)=0.5, then P(A∩B) is:',
 'For independent events, P(A∩B) = P(A) × P(B) = 0.4 × 0.5 = 0.2.',
 '[{"label":"A","text":"0.2","correct":true},{"label":"B","text":"0.9","correct":false},{"label":"C","text":"0.45","correct":false},{"label":"D","text":"0.1","correct":false}]',
 'A', 'mcq', 'medium', 1, '12'),

('BOARDS', 2026, 'Maths', 'Integrals', 'The integral of 1/x dx is:',
 '∫(1/x)dx = ln|x| + C.',
 '[{"label":"A","text":"ln|x| + C","correct":true},{"label":"B","text":"x^2/2 + C","correct":false},{"label":"C","text":"1/x^2 + C","correct":false},{"label":"D","text":"e^x + C","correct":false}]',
 'A', 'mcq', 'medium', 1, '12');
