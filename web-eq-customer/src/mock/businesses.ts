export type Business = {
  id: string;
  name: string;
  categoryId: string;
  rating: number;
  reviewCount: number;
  location: string;
  distance?: string;
  image?: string;
  description: string;
  isOpen: boolean;
  isAlwaysOpen?: boolean;
  opensAt?: string | null;
  closesAt?: string | null;
  nextAvailableTime?: string;
  phone?: string;
  email?: string;
  serviceNames?: string[];
  minPrice?: number | null;
  maxPrice?: number | null;
  latitude?: number | null;
  longitude?: number | null;
};

export const mockBusinesses: Business[] = [
  {
    id: "salon-1",
    name: "Elite Hair Studio",
    categoryId: "salon",
    rating: 4.8,
    reviewCount: 124,
    location: "Downtown Plaza, Main Street",
    distance: "0.5 km",
    description: "Premium hair salon offering cuts, coloring, and styling services.",
    isOpen: true,
    nextAvailableTime: "4:30 PM",
    phone: "+91 98765 43210",
    email: "contact@elitehair.com",
  },
  {
    id: "salon-2",
    name: "Trendy Cuts",
    categoryId: "salon",
    rating: 4.5,
    reviewCount: 89,
    location: "Mall Road, Sector 5",
    distance: "1.2 km",
    description: "Modern salon with expert stylists for men and women.",
    isOpen: true,
    nextAvailableTime: "5:00 PM",
    phone: "+91 98765 43211",
  },
  {
    id: "clinic-1",
    name: "City Health Clinic",
    categoryId: "clinic",
    rating: 4.9,
    reviewCount: 256,
    location: "Medical Complex, Block A",
    distance: "2.1 km",
    description: "Full-service clinic with general practitioners and specialists.",
    isOpen: true,
    nextAvailableTime: "3:45 PM",
    phone: "+91 98765 43212",
  },
  {
    id: "clinic-2",
    name: "Dental Care Plus",
    categoryId: "clinic",
    rating: 4.7,
    reviewCount: 178,
    location: "Health Tower, Floor 3",
    distance: "1.8 km",
    description: "Expert dental care including cleanings, fillings, and cosmetic procedures.",
    isOpen: true,
    nextAvailableTime: "4:15 PM",
    phone: "+91 98765 43213",
  },
  {
    id: "service-center-1",
    name: "QuickFix Service Center",
    categoryId: "service-center",
    rating: 4.6,
    reviewCount: 92,
    location: "Industrial Area, Unit 12",
    distance: "3.5 km",
    description: "Fast and reliable repair services for electronics and appliances.",
    isOpen: true,
    nextAvailableTime: "2:30 PM",
    phone: "+91 98765 43214",
  },
  {
    id: "spa-1",
    name: "Serenity Spa",
    categoryId: "spa",
    rating: 4.8,
    reviewCount: 145,
    location: "Resort Road, Near Lake",
    distance: "4.2 km",
    description: "Luxury spa offering massages, facials, and wellness treatments.",
    isOpen: true,
    nextAvailableTime: "6:00 PM",
    phone: "+91 98765 43215",
  },
  {
    id: "fitness-1",
    name: "FitZone Gym",
    categoryId: "fitness",
    rating: 4.4,
    reviewCount: 203,
    location: "Sports Complex, Building B",
    distance: "1.5 km",
    description: "Modern gym with personal trainers and group classes.",
    isOpen: true,
    nextAvailableTime: "7:00 AM",
    phone: "+91 98765 43216",
  },
  {
    id: "home-services-1",
    name: "CleanHome Services",
    categoryId: "home-services",
    rating: 4.7,
    reviewCount: 167,
    location: "Service Area, Zone 2",
    distance: "2.8 km",
    description: "Professional home cleaning and maintenance services.",
    isOpen: true,
    nextAvailableTime: "9:00 AM",
    phone: "+91 98765 43217",
  },
];

export const getBusinessesByCategory = (categoryId: string): Business[] => {
  return mockBusinesses.filter((b) => b.categoryId === categoryId);
};

export const getBusinessById = (businessId: string): Business | undefined => {
  return mockBusinesses.find((b) => b.id === businessId);
};
