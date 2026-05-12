/**
 * Maps category names to emoji icons
 */
export const getCategoryEmoji = (categoryName: string): string => {
  const emojiMap: Record<string, string> = {
    // Super-categories
    "Health & Medical": "🏥",
    "Beauty & Grooming": "✨",
    "Wellness & Fitness": "🧘",
    "Home & Lifestyle": "🏠",
    // Health subcategories
    "General Practice": "👨‍⚕️",
    "Dental": "🦷",
    "Eye Care": "👁️",
    "Dermatology": "🧴",
    "Cardiology": "❤️",
    "Orthopedic": "🦴",
    "Gynecology": "🌸",
    "Pediatrics": "👶",
    "ENT": "👂",
    "Physiotherapy": "💪",
    "Diagnostics & Pathology": "🔬",
    "Mental Health": "🧠",
    // Beauty subcategories
    "Barbershop": "✂️",
    "Women's Salon": "💅",
    "Makeup Studio": "💄",
    "Tattoo & Piercing": "🎨",
    // Legacy / flat category names
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
