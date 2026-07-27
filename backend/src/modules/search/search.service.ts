import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';

type SearchType = 'posts' | 'second_hand' | 'circles' | 'users' | 'activities' | 'merchants';
type SearchFilters = {
  sort: string;
  contentType: string;
  publishTime: string;
};

const SEARCH_TYPES: SearchType[] = ['posts', 'second_hand', 'circles', 'users', 'activities', 'merchants'];

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async globalSearch(query: any) {
    const keyword = this.normalizeKeyword(query.keyword);
    const page = this.toPositiveInt(query.page, 1);
    const limit = Math.min(this.toPositiveInt(query.limit, 10), 30);
    const regionId = this.normalizeOptional(query.region_id ?? query.regionId);
    const type = this.normalizeType(query.type);
    const targets = type === 'all' ? SEARCH_TYPES : [type];
    const filters = this.normalizeFilters(query);

    if (!keyword) {
      return this.emptyResult(page, limit);
    }

    const results: Record<string, any> = {};
    await Promise.all(
      targets.map(async (target) => {
        results[target] = await this.searchByType(target, keyword, page, limit, regionId, filters);
      }),
    );

    for (const target of SEARCH_TYPES) {
      if (!results[target]) {
        results[target] = { data: [], total: 0, page, limit, pageSize: limit };
      }
    }

    const total = targets.reduce((sum, target) => sum + (results[target]?.total || 0), 0);
    return { success: true, keyword, type, results, total, page, limit, pageSize: limit };
  }

  async hotKeywords(query: any) {
    const limit = Math.min(this.toPositiveInt(query.limit, 10), 30);
    const regionId = this.normalizeOptional(query.region_id ?? query.regionId);

    const [circles, posts, activities, merchants, secondHands] = await Promise.all([
      this.prisma.circle.findMany({
        where: { status: 'active', auditStatus: 'approved', ...(regionId ? { regionId } : {}) },
        select: { name: true, tags: true, memberCount: true, postCount: true },
        orderBy: [{ memberCount: 'desc' }, { postCount: 'desc' }, { createdAt: 'desc' }],
        take: 50,
      }),
      this.prisma.post.findMany({
        where: { status: 'PUBLISHED' as any, deletedAt: null, ...(regionId ? { regionId } : {}) },
        select: { title: true, content: true, likeCount: true, commentCount: true, viewCount: true },
        orderBy: [{ viewCount: 'desc' }, { createdAt: 'desc' }],
        take: 50,
      }),
      this.prisma.activity.findMany({
        where: { status: { in: ['upcoming', 'signup', 'ongoing'] }, visibility: 'public', ...(regionId ? { regionId } : {}) },
        select: { title: true, joinCount: true },
        orderBy: [{ joinCount: 'desc' }, { startAt: 'asc' }],
        take: 30,
      }),
      this.prisma.merchant.findMany({
        where: { status: { in: ['approved', 'closed'] }, ...(regionId ? { regionId } : {}) },
        select: { name: true, saleCount: true },
        orderBy: [{ saleCount: 'desc' }, { createdAt: 'desc' }],
        take: 30,
      }),
      this.prisma.secondHand.findMany({
        where: { status: 'ON_SALE' as any, ...(regionId ? { regionId } : {}) },
        select: { title: true, category: true, wantCount: true, viewCount: true },
        orderBy: [{ viewCount: 'desc' }, { createdAt: 'desc' }],
        take: 30,
      }),
    ]);

    const weights = new Map<string, number>();
    const add = (value: any, weight = 1) => {
      const text = String(value || '').trim();
      if (!text || text.length > 20) return;
      weights.set(text, (weights.get(text) || 0) + weight);
    };

    circles.forEach((item) => {
      add(item.name, 20 + item.memberCount + item.postCount);
      this.normalizeTags(item.tags).forEach((tag) => add(tag, 12 + item.memberCount));
    });
    posts.forEach((item) => {
      add(item.title, 10 + item.viewCount + item.likeCount + item.commentCount);
      this.extractContentWords(item.content).forEach((word) => add(word, 2));
    });
    activities.forEach((item) => add(item.title, 10 + item.joinCount));
    merchants.forEach((item) => add(item.name, 10 + item.saleCount));
    secondHands.forEach((item) => {
      add(item.title, 8 + item.wantCount + item.viewCount);
      add(item.category, 5);
    });

    const data = Array.from(weights.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([keyword, score]) => ({ keyword, score }));

    return { success: true, data, keywords: data.map((item) => item.keyword) };
  }

  private async searchByType(
    type: SearchType,
    keyword: string,
    page: number,
    limit: number,
    regionId: string | undefined,
    filters: SearchFilters,
  ) {
    const skip = (page - 1) * limit;
    const textWhere = (...fields: string[]) => ({
      OR: fields.map((field) => ({ [field]: { contains: keyword } })),
    });

    if (type === 'posts') {
      const where: any = {
        status: 'PUBLISHED',
        deletedAt: null,
        ...(regionId ? { regionId } : {}),
        ...this.createdAtWhere(filters.publishTime),
        ...this.postContentWhere(filters.contentType),
        ...textWhere('title', 'content'),
      };
      const [rows, total] = await Promise.all([
        this.prisma.post.findMany({
          where,
          skip,
          take: limit,
          orderBy: this.orderByFor(type, filters.sort),
          include: {
            user: { select: { id: true, uid: true, publicUid: true, nickname: true, avatar: true } },
            circle: { select: { id: true, name: true, icon: true, cover: true } },
            region: { select: { id: true, name: true } },
            media: true,
            _count: { select: { likes: true, comments: true, favorites: true } },
          },
        }),
        this.prisma.post.count({ where }),
      ]);
      return this.page(rows.map((row) => this.formatPost(row)), total, page, limit);
    }

    if (type === 'second_hand') {
      const where: any = {
        status: 'ON_SALE',
        ...(regionId ? { regionId } : {}),
        ...this.createdAtWhere(filters.publishTime),
        ...textWhere('title', 'description', 'category'),
      };
      const [rows, total] = await Promise.all([
        this.prisma.secondHand.findMany({
          where,
          skip,
          take: limit,
          orderBy: this.orderByFor(type, filters.sort),
          include: {
            user: { select: { id: true, uid: true, publicUid: true, nickname: true, avatar: true } },
            region: { select: { id: true, name: true } },
          },
        }),
        this.prisma.secondHand.count({ where }),
      ]);
      return this.page(rows.map((row) => this.formatSecondHand(row)), total, page, limit);
    }

    if (type === 'circles') {
      const where: any = {
        status: 'active',
        auditStatus: 'approved',
        ...(regionId ? { regionId } : {}),
        ...this.createdAtWhere(filters.publishTime),
        ...textWhere('name', 'description'),
      };
      const [rows, total] = await Promise.all([
        this.prisma.circle.findMany({
          where,
          skip,
          take: limit,
          orderBy: this.orderByFor(type, filters.sort),
          include: {
            members: {
              take: 5,
              orderBy: { joinAt: 'desc' },
              include: { user: { select: { id: true, nickname: true, avatar: true } } },
            },
          },
        }),
        this.prisma.circle.count({ where }),
      ]);
      return this.page(rows.map((row) => this.formatCircle(row)), total, page, limit);
    }

    if (type === 'users') {
      const userSearchOr: any[] = [
        { nickname: { contains: keyword } },
        ...(Number.isFinite(Number(keyword)) ? [{ uid: Number(keyword) }, { publicUid: Number(keyword) }] : []),
        { profile: { is: { bio: { contains: keyword } } } },
        { profile: { is: { school: { contains: keyword } } } },
        { profile: { is: { region: { contains: keyword } } } },
      ];
      const where: any = {
        status: 'ACTIVE',
        deletedAt: null,
        AND: [
          { OR: userSearchOr },
          { OR: [{ settings: { is: null } }, { settings: { is: { allowSearch: true } } }] },
        ],
        ...this.createdAtWhere(filters.publishTime),
      };
      if (regionId) {
        where.profile = { is: { regionId } };
      }
      const [rows, total] = await Promise.all([
        this.prisma.user.findMany({
          where,
          skip,
          take: limit,
          orderBy: this.orderByFor(type, filters.sort),
          select: {
            id: true,
            uid: true,
            publicUid: true,
            nickname: true,
            avatar: true,
            profile: { select: { gender: true, birthday: true, region: true, regionId: true, bio: true, school: true } },
            _count: { select: { posts: true, followers: true } },
          },
        }),
        this.prisma.user.count({ where }),
      ]);
      return this.page(rows.map((row) => this.formatUser(row)), total, page, limit);
    }

    if (type === 'activities') {
      const where: any = {
        status: { in: ['upcoming', 'signup', 'ongoing'] },
        visibility: 'public',
        ...(regionId ? { regionId } : {}),
        ...this.createdAtWhere(filters.publishTime),
        ...textWhere('title', 'description', 'location', 'organizer'),
      };
      const [rows, total] = await Promise.all([
        this.prisma.activity.findMany({
          where,
          skip,
          take: limit,
          orderBy: this.orderByFor(type, filters.sort),
          include: {
            joins: {
              take: 5,
              orderBy: { createdAt: 'desc' },
              include: { user: { select: { id: true, nickname: true, avatar: true } } },
            },
          },
        }),
        this.prisma.activity.count({ where }),
      ]);
      return this.page(rows.map((row) => this.formatActivity(row)), total, page, limit);
    }

    const where: any = {
      status: { in: ['approved', 'closed'] },
      ...(regionId ? { regionId } : {}),
      ...this.createdAtWhere(filters.publishTime),
      ...textWhere('name', 'description', 'address', 'contactPerson'),
    };
    const [rows, total] = await Promise.all([
      this.prisma.merchant.findMany({
        where,
        skip,
        take: limit,
        orderBy: this.orderByFor(type, filters.sort),
        include: { region: { select: { id: true, name: true } }, category: { select: { id: true, name: true } } },
      }),
      this.prisma.merchant.count({ where }),
    ]);
    return this.page(rows.map((row) => this.formatMerchant(row)), total, page, limit);
  }

  private formatPost(post: any) {
    const media = Array.isArray(post.media) ? post.media : [];
    const images = media.filter((item: any) => item.type === 'IMAGE').map((item: any) => item.url);
    const videos = media.filter((item: any) => item.type === 'VIDEO').map((item: any) => item.url);
    return {
      id: post.id,
      title: post.title || '',
      content: post.content || '',
      images,
      videos,
      author: this.formatSimpleUser(post.user),
      stats: {
        like_count: post.likeCount ?? post._count?.likes ?? 0,
        comment_count: post.commentCount ?? post._count?.comments ?? 0,
        view_count: post.viewCount ?? 0,
      },
      is_liked: false,
      is_pinned: Boolean(post.isTop),
      created_at: post.createdAt,
      updated_at: post.updatedAt,
      location: post.location ? { address: post.location } : null,
      circle: post.circle ? { id: post.circle.id, name: post.circle.name, logo: post.circle.icon || post.circle.cover || '' } : null,
      region: post.region ? { id: post.region.id, name: post.region.name } : null,
    };
  }

  private formatSecondHand(item: any) {
    return {
      id: item.id,
      title: item.title,
      description: item.description || item.title,
      images: this.normalizeArray(item.images),
      current_price: Number(item.price || 0),
      original_price: item.originPrice === null || item.originPrice === undefined ? null : Number(item.originPrice),
      category: item.category,
      delivery_type: item.deliveryType,
      freight: Number(item.freight || 0),
      want_count: item.wantCount || 0,
      tags: this.normalizeTags(item.tags),
      seller: this.formatSimpleUser(item.user),
      region: item.region ? { id: item.region.id, name: item.region.name } : null,
      created_at: item.createdAt,
    };
  }

  private formatCircle(circle: any) {
    return {
      id: circle.id,
      name: circle.name,
      logo: circle.icon || circle.cover || '',
      description: circle.description || '',
      status: circle.status === 'active' ? '活跃' : circle.status,
      is_pinned: Boolean(circle.isOfficial),
      stats: {
        member_count: circle.memberCount || 0,
        post_count: circle.postCount || 0,
      },
      recent_members: (circle.members || []).map((member: any) => this.formatSimpleUser(member.user)),
    };
  }

  private formatUser(user: any) {
    return {
      id: user.id,
      uid: user.uid,
      publicUid: user.publicUid,
      nickname: user.nickname || '用户未设置昵称',
      avatar: user.avatar || '',
      gender: this.genderToNumber(user.profile?.gender),
      birthday: user.profile?.birthday || null,
      profile: {
        bio: user.profile?.bio || '',
        school: user.profile?.school || '',
        location: { province: user.profile?.region || '', region_id: user.profile?.regionId || '' },
      },
      stats: {
        post_count: user._count?.posts || 0,
        follower_count: user._count?.followers || 0,
      },
    };
  }

  private formatActivity(activity: any) {
    const avatars = (activity.joins || []).map((join: any) => this.formatSimpleUser(join.user));
    return {
      id: activity.id,
      title: activity.title,
      images: activity.cover ? [activity.cover] : [],
      status: activity.status,
      description: activity.description || '',
      time: { start: this.formatDateTime(activity.startAt), end: this.formatDateTime(activity.endAt) },
      location: { address: activity.location || '' },
      stats: {
        participant_count: activity.joinCount || 0,
        available_participants: Math.max(Number(activity.maxPeople || 0) - Number(activity.joinCount || 0), 0),
      },
      participants: { recent: avatars },
      created_at: activity.createdAt,
    };
  }

  private formatMerchant(merchant: any) {
    const isOpen = merchant.status === 'approved';
    return {
      id: merchant.id,
      name: merchant.name,
      background_url: merchant.cover || merchant.logo || '/static/logo.jpg',
      description: merchant.description || '',
      tags: [merchant.category?.name, merchant.businessType === 'dorm_shop' ? '宿舍小店' : '外卖'].filter(Boolean),
      business_status: { is_open: isOpen, next_open_time: '' },
      stats: {
        average_rating: Number(merchant.rating || 5),
        monthly_sales: merchant.saleCount || 0,
        total_sales: merchant.saleCount || 0,
        avg_spending: '-',
      },
      delivery: {
        mode: merchant.deliveryMode || 'platform_rider',
        time: '',
        fee: Number(merchant.deliveryFee || 0),
        min_order_amount: 0,
      },
      region: merchant.region ? { id: merchant.region.id, name: merchant.region.name } : {},
      contact: { phone: merchant.phone || '', address: merchant.address || '' },
    };
  }

  private formatSimpleUser(user: any) {
    return {
      id: user?.id || '',
      uid: user?.uid,
      publicUid: user?.publicUid,
      nickname: user?.nickname || '用户未设置昵称',
      avatar: user?.avatar || '/static/logo.jpg',
    };
  }

  private page(data: any[], total: number, page: number, limit: number) {
    return { data, total, page, limit, pageSize: limit };
  }

  private emptyResult(page: number, limit: number) {
    const results = SEARCH_TYPES.reduce((acc, type) => {
      acc[type] = this.page([], 0, page, limit);
      return acc;
    }, {} as Record<string, any>);
    return { success: true, keyword: '', type: 'all', results, total: 0, page, limit, pageSize: limit };
  }

  private normalizeType(type: any): SearchType | 'all' {
    const value = String(type || 'all').trim();
    if (value === 'all') return 'all';
    return SEARCH_TYPES.includes(value as SearchType) ? (value as SearchType) : 'posts';
  }

  private normalizeFilters(query: any): SearchFilters {
    return {
      sort: this.normalizeOption(query.sort, 'comprehensive'),
      contentType: this.normalizeOption(query.content_type ?? query.contentType, 'all'),
      publishTime: this.normalizeOption(query.publish_time ?? query.publishTime, 'all'),
    };
  }

  private normalizeOption(value: any, fallback: string) {
    const normalized = String(value || '').trim();
    return normalized || fallback;
  }

  private createdAtWhere(publishTime: string) {
    const daysByValue: Record<string, number> = {
      day: 1,
      week: 7,
      half_year: 183,
    };
    const days = daysByValue[publishTime];
    if (!days) return {};
    return {
      createdAt: {
        gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
      },
    };
  }

  private postContentWhere(contentType: string) {
    if (contentType === 'video') return { type: 'VIDEO' as any };
    if (contentType === 'image_text') return { type: { in: ['IMAGE', 'TEXT'] as any[] } };
    return {};
  }

  private orderByFor(type: SearchType, sort: string): any {
    if (type === 'posts') {
      if (sort === 'latest') return [{ createdAt: 'desc' }];
      if (sort === 'likes') return [{ likeCount: 'desc' }, { createdAt: 'desc' }];
      if (sort === 'comments') return [{ commentCount: 'desc' }, { createdAt: 'desc' }];
      return [{ isTop: 'desc' }, { createdAt: 'desc' }];
    }
    if (type === 'second_hand') {
      if (sort === 'latest') return [{ createdAt: 'desc' }];
      if (sort === 'wants') return [{ wantCount: 'desc' }, { createdAt: 'desc' }];
      return [{ viewCount: 'desc' }, { createdAt: 'desc' }];
    }
    if (type === 'circles') {
      if (sort === 'latest') return [{ createdAt: 'desc' }];
      if (sort === 'posts') return [{ postCount: 'desc' }, { createdAt: 'desc' }];
      return [{ memberCount: 'desc' }, { postCount: 'desc' }, { createdAt: 'desc' }];
    }
    if (type === 'users') {
      return { createdAt: 'desc' };
    }
    if (type === 'activities') {
      if (sort === 'latest') return [{ createdAt: 'desc' }];
      if (sort === 'participants') return [{ joinCount: 'desc' }, { startAt: 'asc' }];
      return [{ sortOrder: 'asc' }, { startAt: 'asc' }];
    }
    if (sort === 'latest') return [{ createdAt: 'desc' }];
    if (sort === 'rating') return [{ rating: 'desc' }, { saleCount: 'desc' }];
    return [{ saleCount: 'desc' }, { createdAt: 'desc' }];
  }

  private normalizeKeyword(value: any) {
    return String(value || '').trim().slice(0, 50);
  }

  private normalizeOptional(value: any) {
    const text = String(value || '').trim();
    return text ? text : undefined;
  }

  private toPositiveInt(value: any, fallback: number) {
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? Math.floor(num) : fallback;
  }

  private normalizeTags(value: any): string[] {
    if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
    if (!value) return [];
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return this.normalizeTags(parsed);
      } catch {}
      return value.split(/[，,\s]+/).map((item) => item.trim()).filter(Boolean);
    }
    return [];
  }

  private normalizeArray(value: any): string[] {
    if (Array.isArray(value)) return value.filter(Boolean).map((item) => String(item));
    if (!value) return [];
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return this.normalizeArray(parsed);
      } catch {}
      return [value];
    }
    return [];
  }

  private extractContentWords(content: any) {
    return String(content || '')
      .replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s]/g, ' ')
      .split(/\s+/)
      .map((item) => item.trim())
      .filter((item) => item.length >= 2 && item.length <= 12)
      .slice(0, 8);
  }

  private genderToNumber(gender?: string) {
    if (gender === 'MALE') return 1;
    if (gender === 'FEMALE') return 2;
    return 0;
  }

  private formatDateTime(value: any) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const pad = (num: number) => String(num).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
}
