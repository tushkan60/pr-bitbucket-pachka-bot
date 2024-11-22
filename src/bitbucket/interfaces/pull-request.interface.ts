export interface BitbucketUser {
  display_name: string;
  account_id: string;
}

export interface PullRequest {
  id: number;
  title: string;
  description: string;
  created_on: string;
  updated_on: string;
  state: 'OPEN' | 'MERGED' | 'DECLINED' | 'SUPERSEDED';
  author: BitbucketUser;
  reviewers: BitbucketUser[];
  participants: Array<{
    user: BitbucketUser;
    role: 'PARTICIPANT' | 'REVIEWER';
    approved: boolean;
    state?: 'approved' | 'changes_requested' | 'pending';
  }>;
  source: {
    branch: {
      name: string;
    };
    repository: {
      full_name: string;
    };
  };
  destination: {
    branch: {
      name: string;
    };
  };
  links: {
    html: {
      href: string;
    };
  };
}
