const fs = require('fs');
const data = JSON.parse(fs.readFileSync('./nutricional_data.json', 'utf8'));

// Filter out duplicates by name or clean up if necessary
const unique = [];
const seenNames = new Set();
for (const item of data) {
    let name = item.food;
    // Capitalize properly: lower case first, then capitalize first letter of each word
    const cleanName = name.toLowerCase().replace(/(^\w|\s\w)/g, m => m.toUpperCase());
    const category = item.category ? item.category.toLowerCase().replace(/(^\w|\s\w)/g, m => m.toUpperCase()) : undefined;
    
    if (!seenNames.has(cleanName)) {
        seenNames.add(cleanName);
        unique.push({
            id: String(unique.length + 1),
            name: cleanName,
            carbsPer100g: item.hc_g_100g,
            category: category
        });
    }
}

const fileContent = `// FEN Source DB
import { Ingredient } from '../types';

export const INITIAL_INGREDIENTS: Ingredient[] = [
${unique.map(i => `  { id: '${i.id}', name: '${i.name.replace(/'/g, "\\'")}', carbsPer100g: ${i.carbsPer100g}${i.category ? `, category: '${i.category.replace(/'/g, "\\'")}'` : ''} },`).join('\n')}
];
`;

fs.writeFileSync('./src/data/ingredients.ts', fileContent);
console.log(`Generated ${unique.length} ingredients.`);
