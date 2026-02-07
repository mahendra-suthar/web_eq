export type Service = {
  id: string;
  businessId: string;
  name: string;
  description?: string;
  duration: number; // minutes
  price: number;
  currency?: string;
};

export const mockServices: Service[] = [
  // Salon services
  { id: "svc-1", businessId: "salon-1", name: "Haircut", description: "Professional haircut and styling", duration: 30, price: 500, currency: "INR" },
  { id: "svc-2", businessId: "salon-1", name: "Hair Color", description: "Full hair coloring service", duration: 120, price: 2500, currency: "INR" },
  { id: "svc-3", businessId: "salon-1", name: "Hair Spa", description: "Relaxing hair spa treatment", duration: 60, price: 1500, currency: "INR" },
  { id: "svc-4", businessId: "salon-2", name: "Men's Cut", description: "Classic men's haircut", duration: 25, price: 400, currency: "INR" },
  { id: "svc-5", businessId: "salon-2", name: "Women's Styling", description: "Complete styling package", duration: 90, price: 1800, currency: "INR" },
  
  // Clinic services
  { id: "svc-6", businessId: "clinic-1", name: "General Consultation", description: "Doctor consultation", duration: 15, price: 500, currency: "INR" },
  { id: "svc-7", businessId: "clinic-1", name: "Health Checkup", description: "Complete health screening", duration: 45, price: 2000, currency: "INR" },
  { id: "svc-8", businessId: "clinic-2", name: "Dental Cleaning", description: "Professional teeth cleaning", duration: 30, price: 800, currency: "INR" },
  { id: "svc-9", businessId: "clinic-2", name: "Tooth Filling", description: "Cavity filling procedure", duration: 45, price: 1500, currency: "INR" },
  
  // Service center
  { id: "svc-10", businessId: "service-center-1", name: "Phone Repair", description: "Mobile phone repair service", duration: 60, price: 500, currency: "INR" },
  { id: "svc-11", businessId: "service-center-1", name: "Laptop Service", description: "Laptop cleaning and repair", duration: 90, price: 1000, currency: "INR" },
  
  // Spa services
  { id: "svc-12", businessId: "spa-1", name: "Swedish Massage", description: "Relaxing full body massage", duration: 60, price: 2000, currency: "INR" },
  { id: "svc-13", businessId: "spa-1", name: "Facial Treatment", description: "Deep cleansing facial", duration: 45, price: 1500, currency: "INR" },
  
  // Fitness services
  { id: "svc-14", businessId: "fitness-1", name: "Personal Training", description: "One-on-one training session", duration: 60, price: 800, currency: "INR" },
  { id: "svc-15", businessId: "fitness-1", name: "Group Class", description: "Fitness group class", duration: 45, price: 300, currency: "INR" },
  
  // Home services
  { id: "svc-16", businessId: "home-services-1", name: "Deep Cleaning", description: "Complete home deep cleaning", duration: 180, price: 2500, currency: "INR" },
  { id: "svc-17", businessId: "home-services-1", name: "Regular Cleaning", description: "Standard home cleaning", duration: 120, price: 1500, currency: "INR" },
];

export const getServicesByBusiness = (businessId: string): Service[] => {
  return mockServices.filter((s) => s.businessId === businessId);
};

export const getServiceById = (serviceId: string): Service | undefined => {
  return mockServices.find((s) => s.id === serviceId);
};
