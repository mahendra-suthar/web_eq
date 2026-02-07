export type CustomerCategory = {
  id: string;
  name: string;
  description: string;
  emoji: string;
};

export const mockCategories: CustomerCategory[] = [
  { id: "salon", name: "Salon", description: "Hair, makeup, grooming", emoji: "💇" },
  { id: "clinic", name: "Clinic", description: "Doctors, dental, wellness", emoji: "🩺" },
  { id: "service-center", name: "Service Center", description: "Repair & maintenance", emoji: "🛠️" },
  { id: "spa", name: "Spa", description: "Relaxation & therapy", emoji: "🧖" },
  { id: "fitness", name: "Fitness", description: "Gym & coaching", emoji: "🏋️" },
  { id: "home-services", name: "Home Services", description: "Cleaning & fixing", emoji: "🏠" },
];

