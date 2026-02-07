/**
 * Maps category names to emoji icons
 */
export const getCategoryEmoji = (categoryName: string): string => {
  const emojiMap: Record<string, string> = {
    "Salon": "💇",
    "Clinic": "🩺",
    "Service Center": "🛠️",
    "Spa": "🧖",
    "Fitness": "🏋️",
    "Home Services": "🏠",
    "Restaurant": "🍽️",
    "Beauty": "💄",
    "Medical": "🏥",
    "Automotive": "🚗",
  };
  
  return emojiMap[categoryName] || "📋";
};
