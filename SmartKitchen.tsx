import React, { useState } from 'react'
import { ChefHat, Clock, Star, Lightbulb, Calendar, Plus, Trash2, Send, Loader } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import OpenAI from 'openai'

interface Recipe {
  name: string
  ingredients: string
  prepSteps: string
  prepTime: string
  difficulty: string
  substitutions: string
}

interface MealPlan {
  day: string
  breakfast: string
  lunch: string
  dinner: string
}

interface SmartKitchenResponse {
  recipes: Recipe[]
  quotes: string[]
  mealPlan: MealPlan[]
}

const openai = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true
})

const SMART_KITCHEN_PROMPT = `You are a creative cooking assistant and food-waste reduction advisor. 
A user has leftover ingredients and wants to make meals from them. 

Your task:
1. Suggest 2-3 practical recipes using the leftover ingredients.
   - Include short preparation steps.
   - Include prep time and difficulty level (Easy/Medium/Hard).
2. If any ingredient is missing for a recipe, suggest smart substitutions.
   - Example: "No bread for a potato sandwich? Use lettuce wraps or tortillas instead."
3. Provide 2-3 motivational or inspirational quotes/tips to encourage reducing food waste.
4. Plan meals for the next 2-3 days using the leftover ingredients.
   - Include breakfast, lunch, and dinner suggestions where possible.
   - Suggest any additional common ingredients that could enhance these meals.

Output format clearly:
---
Recipes:
1. Name: [Recipe Name]
   Ingredients: [List ingredients]
   Prep Steps: [Brief steps]
   Prep Time: [Time]
   Difficulty: [Easy/Medium/Hard]
   Substitutions: [Alternative ingredients]

2. Name: [Recipe Name]
   Ingredients: [List ingredients]
   Prep Steps: [Brief steps]
   Prep Time: [Time]
   Difficulty: [Easy/Medium/Hard]
   Substitutions: [Alternative ingredients]

3. Name: [Recipe Name]
   Ingredients: [List ingredients]
   Prep Steps: [Brief steps]
   Prep Time: [Time]
   Difficulty: [Easy/Medium/Hard]
   Substitutions: [Alternative ingredients]

Motivational Quotes:
1. [Quote about reducing food waste]
2. [Quote about creative cooking]
3. [Quote about sustainability]

Meal Plan for Next 2-3 Days:
Day 1:
  Breakfast: [Suggestion]
  Lunch: [Suggestion]
  Dinner: [Suggestion]
Day 2:
  Breakfast: [Suggestion]
  Lunch: [Suggestion]
  Dinner: [Suggestion]
Day 3:
  Breakfast: [Suggestion]
  Lunch: [Suggestion]
  Dinner: [Suggestion]`

export default function SmartKitchen() {
  const { isDark } = useTheme()
  const [ingredients, setIngredients] = useState<string[]>([''])
  const [mealType, setMealType] = useState('any')
  const [dietaryPreferences, setDietaryPreferences] = useState('')
  const [loading, setLoading] = useState(false)
  const [response, setResponse] = useState<SmartKitchenResponse | null>(null)
  const [error, setError] = useState('')

  const addIngredient = () => {
    setIngredients([...ingredients, ''])
  }

  const removeIngredient = (index: number) => {
    if (ingredients.length > 1) {
      setIngredients(ingredients.filter((_, i) => i !== index))
    }
  }

  const updateIngredient = (index: number, value: string) => {
    const newIngredients = [...ingredients]
    newIngredients[index] = value
    setIngredients(newIngredients)
  }

  const parseAIResponse = (text: string): SmartKitchenResponse => {
    const recipes: Recipe[] = []
    const quotes: string[] = []
    const mealPlan: MealPlan[] = []

    // Parse recipes
    const recipeMatches = text.match(/(\d+\.\s*Name:\s*(.+?)\s*Ingredients:\s*(.+?)\s*Prep Steps:\s*(.+?)\s*Prep Time:\s*(.+?)\s*Difficulty:\s*(.+?)\s*Substitutions:\s*(.+?)(?=\d+\.\s*Name:|Motivational Quotes:|$))/gs)
    
    if (recipeMatches) {
      recipeMatches.forEach(match => {
        const lines = match.split('\n').map(line => line.trim()).filter(line => line)
        let recipe: Partial<Recipe> = {}
        
        lines.forEach(line => {
          if (line.includes('Name:')) recipe.name = line.split('Name:')[1]?.trim()
          if (line.includes('Ingredients:')) recipe.ingredients = line.split('Ingredients:')[1]?.trim()
          if (line.includes('Prep Steps:')) recipe.prepSteps = line.split('Prep Steps:')[1]?.trim()
          if (line.includes('Prep Time:')) recipe.prepTime = line.split('Prep Time:')[1]?.trim()
          if (line.includes('Difficulty:')) recipe.difficulty = line.split('Difficulty:')[1]?.trim()
          if (line.includes('Substitutions:')) recipe.substitutions = line.split('Substitutions:')[1]?.trim()
        })
        
        if (recipe.name) {
          recipes.push(recipe as Recipe)
        }
      })
    }

    // Parse quotes
    const quotesSection = text.match(/Motivational Quotes:(.*?)(?=Meal Plan|$)/s)
    if (quotesSection) {
      const quoteMatches = quotesSection[1].match(/\d+\.\s*(.+?)(?=\d+\.|$)/g)
      if (quoteMatches) {
        quoteMatches.forEach(match => {
          const quote = match.replace(/^\d+\.\s*/, '').trim()
          if (quote) quotes.push(quote)
        })
      }
    }

    // Parse meal plan
    const mealPlanSection = text.match(/Meal Plan for Next 2-3 Days:(.*?)$/s)
    if (mealPlanSection) {
      const dayMatches = mealPlanSection[1].match(/Day \d+:(.*?)(?=Day \d+:|$)/gs)
      if (dayMatches) {
        dayMatches.forEach((dayMatch, index) => {
          const dayNumber = index + 1
          const breakfastMatch = dayMatch.match(/Breakfast:\s*(.+?)(?=\n|Lunch:|$)/s)
          const lunchMatch = dayMatch.match(/Lunch:\s*(.+?)(?=\n|Dinner:|$)/s)
          const dinnerMatch = dayMatch.match(/Dinner:\s*(.+?)(?=\n|Day \d+:|$)/s)
          
          mealPlan.push({
            day: `Day ${dayNumber}`,
            breakfast: breakfastMatch?.[1]?.trim() || 'No suggestion',
            lunch: lunchMatch?.[1]?.trim() || 'No suggestion',
            dinner: dinnerMatch?.[1]?.trim() || 'No suggestion'
          })
        })
      }
    }

    return { recipes, quotes, mealPlan }
  }

  const generateMealSuggestions = async () => {
    const validIngredients = ingredients.filter(ing => ing.trim())
    if (validIngredients.length === 0) {
      setError('Please add at least one ingredient')
      return
    }

    setLoading(true)
    setError('')

    try {
      const userInput = `
Leftover ingredients: ${validIngredients.join(', ')}
Meal type / preference: ${mealType}
Dietary preferences: ${dietaryPreferences || 'None specified'}
      `.trim()

      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: SMART_KITCHEN_PROMPT },
          { role: 'user', content: userInput }
        ],
        temperature: 0.8,
        max_tokens: 2000
      })

      const aiResponse = response.choices[0]?.message?.content || ''
      const parsedResponse = parseAIResponse(aiResponse)
      
      // Fallback if parsing fails
      if (parsedResponse.recipes.length === 0) {
        parsedResponse.recipes = [
          {
            name: 'Creative Leftover Mix',
            ingredients: validIngredients.join(', '),
            prepSteps: 'Combine ingredients creatively based on your taste preferences',
            prepTime: '15-20 minutes',
            difficulty: 'Easy',
            substitutions: 'Use any similar ingredients you have available'
          }
        ]
      }

      if (parsedResponse.quotes.length === 0) {
        parsedResponse.quotes = [
          'Every ingredient saved is a step towards a more sustainable kitchen!',
          'Creativity in cooking starts with making the most of what you have.',
          'Reducing food waste is one of the easiest ways to help our planet.'
        ]
      }

      setResponse(parsedResponse)
    } catch (err) {
      console.error('Error generating meal suggestions:', err)
      setError('Failed to generate meal suggestions. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty?.toLowerCase()) {
      case 'easy': return 'text-green-600 bg-green-100'
      case 'medium': return 'text-yellow-600 bg-yellow-100'
      case 'hard': return 'text-red-600 bg-red-100'
      default: return 'text-gray-600 bg-gray-100'
    }
  }

  return (
    <div className={`min-h-screen p-4 transition-colors duration-300 ${
      isDark 
        ? 'bg-gradient-to-br from-slate-900 via-orange-900 to-slate-900' 
        : 'bg-gradient-to-br from-orange-50 via-white to-yellow-50'
    }`}>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg ${
              isDark ? 'bg-orange-500' : 'bg-orange-600'
            }`}>
              <ChefHat className="w-8 h-8 text-white" />
            </div>
          </div>
          <h1 className={`text-4xl font-bold mb-2 ${
            isDark ? 'text-white' : 'text-gray-900'
          }`}>🍳 Smart Kitchen</h1>
          <p className={`text-lg ${
            isDark ? 'text-slate-300' : 'text-gray-600'
          }`}>Transform your leftovers into delicious meals & reduce food waste</p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Input Panel */}
          <div className={`backdrop-blur-sm rounded-2xl p-6 border transition-colors duration-300 ${
            isDark 
              ? 'bg-slate-800/50 border-slate-700' 
              : 'bg-white/80 border-orange-200'
          }`}>
            <div className="flex items-center gap-3 mb-6">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                isDark ? 'bg-orange-500' : 'bg-orange-600'
              }`}>
                <Plus className="w-5 h-5 text-white" />
              </div>
              <h2 className={`text-xl font-semibold ${
                isDark ? 'text-white' : 'text-gray-900'
              }`}>Your Leftover Ingredients</h2>
            </div>

            {/* Ingredients Input */}
            <div className="space-y-3 mb-6">
              {ingredients.map((ingredient, index) => (
                <div key={index} className="flex gap-2">
                  <input
                    type="text"
                    value={ingredient}
                    onChange={(e) => updateIngredient(index, e.target.value)}
                    placeholder={`Ingredient ${index + 1}...`}
                    className={`flex-1 border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-colors duration-300 ${
                      isDark 
                        ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400' 
                        : 'bg-white border-orange-300 text-gray-900 placeholder-gray-500'
                    }`}
                  />
                  {ingredients.length > 1 && (
                    <button
                      onClick={() => removeIngredient(index)}
                      className={`p-2 rounded-lg transition-colors ${
                        isDark 
                          ? 'text-red-400 hover:bg-red-900/20' 
                          : 'text-red-500 hover:bg-red-50'
                      }`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              
              <button
                onClick={addIngredient}
                className={`w-full py-2 border-2 border-dashed rounded-lg transition-colors ${
                  isDark 
                    ? 'border-slate-600 text-slate-400 hover:border-orange-500 hover:text-orange-400' 
                    : 'border-orange-300 text-orange-600 hover:border-orange-500 hover:text-orange-700'
                }`}
              >
                + Add Another Ingredient
              </button>
            </div>

            {/* Meal Type Selection */}
            <div className="mb-6">
              <label className={`block text-sm font-medium mb-3 ${
                isDark ? 'text-white' : 'text-gray-900'
              }`}>
                Meal Type Preference
              </label>
              <div className="grid grid-cols-2 gap-2">
                {['any', 'breakfast', 'lunch', 'dinner', 'snack'].map((type) => (
                  <button
                    key={type}
                    onClick={() => setMealType(type)}
                    className={`py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                      mealType === type
                        ? isDark 
                          ? 'bg-orange-500 text-white' 
                          : 'bg-orange-600 text-white'
                        : isDark 
                          ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' 
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Dietary Preferences */}
            <div className="mb-6">
              <label className={`block text-sm font-medium mb-2 ${
                isDark ? 'text-white' : 'text-gray-900'
              }`}>
                Dietary Preferences (Optional)
              </label>
              <input
                type="text"
                value={dietaryPreferences}
                onChange={(e) => setDietaryPreferences(e.target.value)}
                placeholder="e.g., vegan, gluten-free, low-carb..."
                className={`w-full border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-colors duration-300 ${
                  isDark 
                    ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400' 
                    : 'bg-white border-orange-300 text-gray-900 placeholder-gray-500'
                }`}
              />
            </div>

            {/* Generate Button */}
            <button
              onClick={generateMealSuggestions}
              disabled={loading || ingredients.every(ing => !ing.trim())}
              className={`w-full py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${
                isDark 
                  ? 'bg-orange-500 hover:bg-orange-600 disabled:bg-orange-400 text-white' 
                  : 'bg-orange-600 hover:bg-orange-700 disabled:bg-orange-400 text-white'
              }`}
            >
              {loading ? (
                <>
                  <Loader className="w-5 h-5 animate-spin" />
                  Generating Ideas...
                </>
              ) : (
                <>
                  <Send className="w-5 h-5" />
                  Get Smart Suggestions
                </>
              )}
            </button>

            {error && (
              <div className={`mt-4 p-3 rounded-lg ${
                isDark ? 'bg-red-900/20 text-red-400' : 'bg-red-50 text-red-600'
              }`}>
                {error}
              </div>
            )}
          </div>

          {/* Results Panel */}
          <div className={`backdrop-blur-sm rounded-2xl p-6 border transition-colors duration-300 ${
            isDark 
              ? 'bg-slate-800/50 border-slate-700' 
              : 'bg-white/80 border-orange-200'
          }`}>
            <div className="flex items-center gap-3 mb-6">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                isDark ? 'bg-green-500' : 'bg-green-600'
              }`}>
                <Lightbulb className="w-5 h-5 text-white" />
              </div>
              <h2 className={`text-xl font-semibold ${
                isDark ? 'text-white' : 'text-gray-900'
              }`}>Smart Suggestions</h2>
            </div>

            {!response ? (
              <div className="text-center py-12">
                <ChefHat className={`w-16 h-16 mx-auto mb-4 ${
                  isDark ? 'text-slate-600' : 'text-gray-300'
                }`} />
                <p className={isDark ? 'text-slate-400' : 'text-gray-500'}>
                  Add your leftover ingredients to get personalized recipe suggestions
                </p>
              </div>
            ) : (
              <div className="space-y-8 max-h-[600px] overflow-y-auto">
                {/* Recipes */}
                {response.recipes.length > 0 && (
                  <div>
                    <h3 className={`text-lg font-semibold mb-4 flex items-center gap-2 ${
                      isDark ? 'text-white' : 'text-gray-900'
                    }`}>
                      🍽️ Recipe Suggestions
                    </h3>
                    <div className="space-y-4">
                      {response.recipes.map((recipe, index) => (
                        <div key={index} className={`p-4 rounded-lg border ${
                          isDark ? 'bg-slate-700/50 border-slate-600' : 'bg-orange-50/80 border-orange-200'
                        }`}>
                          <div className="flex items-start justify-between mb-2">
                            <h4 className={`font-semibold ${
                              isDark ? 'text-white' : 'text-gray-900'
                            }`}>{recipe.name}</h4>
                            <div className="flex items-center gap-2">
                              <span className={`text-xs px-2 py-1 rounded-full ${getDifficultyColor(recipe.difficulty)}`}>
                                {recipe.difficulty}
                              </span>
                              <span className={`text-xs flex items-center gap-1 ${
                                isDark ? 'text-slate-400' : 'text-gray-600'
                              }`}>
                                <Clock className="w-3 h-3" />
                                {recipe.prepTime}
                              </span>
                            </div>
                          </div>
                          
                          <div className={`text-sm mb-2 ${
                            isDark ? 'text-slate-300' : 'text-gray-700'
                          }`}>
                            <strong>Ingredients:</strong> {recipe.ingredients}
                          </div>
                          
                          <div className={`text-sm mb-2 ${
                            isDark ? 'text-slate-300' : 'text-gray-700'
                          }`}>
                            <strong>Steps:</strong> {recipe.prepSteps}
                          </div>
                          
                          {recipe.substitutions && (
                            <div className={`text-sm ${
                              isDark ? 'text-blue-400' : 'text-blue-600'
                            }`}>
                              <strong>💡 Substitutions:</strong> {recipe.substitutions}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Motivational Quotes */}
                {response.quotes.length > 0 && (
                  <div>
                    <h3 className={`text-lg font-semibold mb-4 flex items-center gap-2 ${
                      isDark ? 'text-white' : 'text-gray-900'
                    }`}>
                      💚 Food Waste Tips
                    </h3>
                    <div className="space-y-3">
                      {response.quotes.map((quote, index) => (
                        <div key={index} className={`p-3 rounded-lg italic ${
                          isDark ? 'bg-green-900/20 text-green-400' : 'bg-green-50 text-green-700'
                        }`}>
                          "{quote}"
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Meal Plan */}
                {response.mealPlan.length > 0 && (
                  <div>
                    <h3 className={`text-lg font-semibold mb-4 flex items-center gap-2 ${
                      isDark ? 'text-white' : 'text-gray-900'
                    }`}>
                      <Calendar className="w-5 h-5" />
                      3-Day Meal Plan
                    </h3>
                    <div className="space-y-4">
                      {response.mealPlan.map((day, index) => (
                        <div key={index} className={`p-4 rounded-lg ${
                          isDark ? 'bg-slate-700/50' : 'bg-blue-50/80'
                        }`}>
                          <h4 className={`font-semibold mb-3 ${
                            isDark ? 'text-blue-400' : 'text-blue-700'
                          }`}>{day.day}</h4>
                          <div className="grid grid-cols-1 gap-2 text-sm">
                            <div>
                              <span className={`font-medium ${
                                isDark ? 'text-slate-300' : 'text-gray-700'
                              }`}>🌅 Breakfast:</span> {day.breakfast}
                            </div>
                            <div>
                              <span className={`font-medium ${
                                isDark ? 'text-slate-300' : 'text-gray-700'
                              }`}>🌞 Lunch:</span> {day.lunch}
                            </div>
                            <div>
                              <span className={`font-medium ${
                                isDark ? 'text-slate-300' : 'text-gray-700'
                              }`}>🌙 Dinner:</span> {day.dinner}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}