import json

# The questions in a structured format
questions = [
    {
        "text": "Who is Mr. Jones?",
        "type": "multiple-choice",
        "options": [
            "A music teacher",
            "A student",
            "The head teacher",
            "A visitor"
        ],
        "correctAnswer": 2  # Index of correct answer (0-based)
    },
    {
        "text": "What is another name for \"head teacher\"?",
        "type": "multiple-choice",
        "options": [
            "Gym coach",
            "Principal",
            "Assistant teacher",
            "Music teacher"
        ],
        "correctAnswer": 1
    },
    {
        "text": "What is the name of the school?",
        "type": "multiple-choice",
        "options": [
            "Three Oaks Primary",
            "Three Oaks Secondary",
            "Three Trees School",
            "Oakwood Secondary"
        ],
        "correctAnswer": 1
    },
    {
        "text": "Who are the two new students?",
        "type": "multiple-choice",
        "options": [
            "Ravi and Mr. Jones",
            "Keira and Viki",
            "Keira and Ravi",
            "Viki and Pablo"
        ],
        "correctAnswer": 2
    },
    {
        "text": "Who is showing Keira and Ravi around the school?",
        "type": "multiple-choice",
        "options": [
            "Mr. Jones",
            "Pablo and Viki",
            "Keira and Ravi",
            "Ravi and Mr. Jones"
        ],
        "correctAnswer": 1
    },
    {
        "text": "Where is the music room?",
        "type": "multiple-choice",
        "options": [
            "Near the library",
            "In the gym",
            "It's not clearly mentioned",
            "Next to the dining room"
        ],
        "correctAnswer": 2
    },
    {
        "text": "What kind of music will the concert have?",
        "type": "multiple-choice",
        "options": [
            "Classical",
            "Rock",
            "Traditional jazz",
            "Pop"
        ],
        "correctAnswer": 2
    },
    {
        "text": "Does Viki like music?",
        "type": "multiple-choice",
        "options": [
            "No, she prefers sports",
            "Yes, she often goes to concerts",
            "No, she thinks it's boring",
            "Yes, but only classical music"
        ],
        "correctAnswer": 1
    },
    {
        "text": "What is Keira's favourite place in the school?",
        "type": "multiple-choice",
        "options": [
            "The gym",
            "The science room",
            "The music room",
            "The lunchroom"
        ],
        "correctAnswer": 2
    },
    {
        "text": "What do they do in the gym?",
        "type": "multiple-choice",
        "options": [
            "Eat lunch",
            "Listen to music",
            "Play basketball, football, and do gymnastics",
            "Study math"
        ],
        "correctAnswer": 2
    },
    {
        "text": "What is happening in the gym tomorrow?",
        "type": "multiple-choice",
        "options": [
            "A football game",
            "A music concert",
            "A gymnastics demonstration",
            "A science experiment"
        ],
        "correctAnswer": 2
    },
    {
        "text": "What are the students wearing for the gymnastics demonstration?",
        "type": "multiple-choice",
        "options": [
            "School uniforms",
            "Clothes from the museum",
            "Normal sports clothes",
            "Traditional costumes"
        ],
        "correctAnswer": 1
    },
    {
        "text": "How old are the museum sports clothes?",
        "type": "multiple-choice",
        "options": [
            "10 years",
            "50 years",
            "100 years",
            "200 years"
        ],
        "correctAnswer": 2
    },
    {
        "text": "Where do the students go when the bell rings?",
        "type": "multiple-choice",
        "options": [
            "To the gym",
            "To the music room",
            "To the lunchroom",
            "To their homes"
        ],
        "correctAnswer": 2
    },
    {
        "text": "What joke does Keira make at the end?",
        "type": "multiple-choice",
        "options": [
            "The lunch is free",
            "The food is 100 years old",
            "The teacher is very old",
            "The gym is closed"
        ],
        "correctAnswer": 1
    }
]

# Create the assessment object
assessment = {
    "title": "School Tour Quiz",
    "description": "Multiple choice questions about the school tour",
    "type": "quiz",
    "questions": questions
}

# Save to JSON file
with open('school_tour_quiz.json', 'w', encoding='utf-8') as f:
    json.dump(assessment, f, indent=2, ensure_ascii=False)

print("Questions have been converted and saved to 'school_tour_quiz.json'") 