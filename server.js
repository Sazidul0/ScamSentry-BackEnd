// Import required modules
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
// const fetch = require('node-fetch');
const fetch = (...args) => import('node-fetch').then(module => module.default(...args));
const axios = require('axios');
require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(bodyParser.json());

const genAI = new GoogleGenerativeAI(`${process.env.GEMENI_API_KEY}`);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Function to get structure instruction based on language
const getStructureInstruction = (lang) => {
    if (lang === 'bn') {
        return "Based on the user input, tell in short if it is a scam or not and what the user should do now. Keep the answer in Bangla.";
    }
    return "Based on the user input, tell in short if it is a scam or not and what the user should do now in English.";
};

// Function to translate text using LibreTranslate with retry logic
const translateToBangla = async (text, retries = 3) => {
    while (retries > 0) {
        try {
            const res = await fetch("https://libretranslate.com/translate", {
                method: "POST",
                body: JSON.stringify({
                    q: text, // Replace 'text' with the variable holding your input
                    source: "en",
                    target: "bn",
                    format: "text",
                }),
                headers: { "Content-Type": "application/json" }
            });

            const data = await res.json();
            return data.translatedText;
        } catch (error) {
            console.error(`Translation Error (Retries left: ${retries - 1}):`, error.message);
            retries -= 1;
            if (retries === 0) {
                return text; // Fallback to original text
            }
        }
    }
};

// Endpoint to fetch AI summary
app.get('/api/:lang/get_summary', async (req, res) => {
    const { lang } = req.params;
    const userInput = req.query.input;

    if (!userInput) {
        return res.status(400).json({ error: "Input query parameter is required." });
    }

    const structureInstruction = getStructureInstruction(lang);
    const prompt = `${userInput}. ${structureInstruction}`;

    try {
        const result = await model.generateContent(prompt);
        let summary = result.response.text();

        if (lang === 'bn') {
            summary = await translateToBangla(summary);
        }
        res.json({ summary });
    } catch (error) {
        console.error("Summary Error:", error.message);
        res.status(500).json({ error: "Failed to fetch summary. Please try again later." });
    }
});

// Endpoint to fetch training data
app.get('/api/:lang/get_training_data', (req, res) => {
    const { lang } = req.params;
    try {
        const data = fs.readFileSync('data.json', 'utf8');
        const jsonData = JSON.parse(data);
        const trainingData = jsonData[lang];
        if (!trainingData) {
            return res.status(404).json({ error: `Training data not found for language: ${lang}` });
        }
        res.json({ training_data: trainingData });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Endpoint to fetch security-related news
app.get('/api/:lang/get_news', async (req, res) => {
    const { lang } = req.params;
    try {
        const newsResponse = await axios.get('https://newsapi.org/v2/everything', {
            params: {
                q: 'cybersecurity',
                apiKey: `${process.env.NEWS_API_KEY}`,
                language: 'en'
            },
            timeout: 5000 // Set timeout to handle delays
        });

        let articles = newsResponse.data.articles.map(article => ({
            title: article.title,
            description: article.description,
            url: article.url
        }));

        if (lang === 'bn') {
            articles = await Promise.all(articles.map(async article => {
                const translatedTitle = await translateToBangla(article.title);
                const translatedDescription = await translateToBangla(article.description);
                return {
                    title: translatedTitle,
                    description: translatedDescription,
                    url: article.url
                };
            }));
        }

        res.json({ news: articles });
    } catch (error) {
        console.error("News Fetch Error:", error.message);
        res.status(500).json({ error: "Failed to fetch news. Please try again later." });
    }
});

// Start the server
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});




