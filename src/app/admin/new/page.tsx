import { PostEditor } from '../components/PostEditor';

export const metadata = {
  title: 'New Post',
};

export default function NewPostPage() {
  return (
    <div className="min-h-screen bg-background">
      <PostEditor />
    </div>
  );
}

