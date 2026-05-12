import { HttpClient } from '../api/httpclient.service';

export interface ReviewData {
  uuid: string;
  user_id: string;
  business_id: string;
  rating: number;
  comment: string | null;
  is_verified: boolean;
  user_name: string | null;
  created_at: string | null;
}

export interface BusinessReviewSummary {
  average_rating: number;
  review_count: number;
}

export interface FeaturedReview {
  uuid: string;
  user_name: string | null;
  business_name: string;
  rating: number;
  comment: string;
  created_at: string | null;
}

export interface ReviewCreateInput {
  business_id: string;
  rating: number;
  comment?: string | null;
  queue_user_id?: string;
}

export class ReviewService extends HttpClient {
  constructor() {
    super();
  }

  async getBusinessReviews(businessId: string, limit = 50, offset = 0): Promise<ReviewData[]> {
    try {
      return await this.get<ReviewData[]>(
        `/review/get_business_reviews/${businessId}?limit=${limit}&offset=${offset}`
      );
    } catch (error: any) {
      if (import.meta.env.DEV) console.error("Failed to fetch reviews:", error);
      throw error;
    }
  }

  async getBusinessReviewSummary(businessId: string): Promise<BusinessReviewSummary> {
    try {
      return await this.get<BusinessReviewSummary>(
        `/review/get_business_review_summary/${businessId}`
      );
    } catch (error: any) {
      if (import.meta.env.DEV) console.error("Failed to fetch review summary:", error);
      throw error;
    }
  }

  async getMyReview(params: { businessId: string } | { queueUserId: string }): Promise<ReviewData | null> {
    const query = "businessId" in params
      ? `business_id=${params.businessId}`
      : `queue_user_id=${params.queueUserId}`;
    try {
      return await this.get<ReviewData | null>(`/review/my_review?${query}`);
    } catch (error: any) {
      if (import.meta.env.DEV) console.error("Failed to fetch my review:", error);
      throw error;
    }
  }

  async getFeaturedReviews(limit = 6): Promise<FeaturedReview[]> {
    try {
      return await this.get<FeaturedReview[]>(`/review/featured?limit=${limit}`);
    } catch (error: any) {
      if (import.meta.env.DEV) console.error("Failed to fetch featured reviews:", error);
      throw error;
    }
  }

  async createReview(payload: ReviewCreateInput): Promise<ReviewData> {
    try {
      return await this.post<ReviewData>('/review/create_review', payload);
    } catch (error: any) {
      if (import.meta.env.DEV) console.error("Failed to create review:", error);
      throw error;
    }
  }
}
