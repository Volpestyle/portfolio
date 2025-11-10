'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useState, useEffect } from 'react';
import type { BlogPostRecord } from '@/types/blog';

export function PostsTable() {
  const searchParams = useSearchParams();
  const [posts, setPosts] = useState<BlogPostRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchPosts() {
      try {
        setLoading(true);
        const params = new URLSearchParams();
        const search = searchParams.get('search');
        const status = searchParams.get('status');
        
        if (search) params.set('search', search);
        if (status && status !== 'all') params.set('status', status);
        
        const response = await fetch(`/api/admin/posts?${params.toString()}`);
        if (!response.ok) throw new Error('Failed to fetch posts');
        
        const data = await response.json();
        setPosts(data.posts || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    }

    fetchPosts();
  }, [searchParams]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground">Loading posts...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
        <p className="text-sm text-destructive">Error: {error}</p>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-muted-foreground text-lg mb-4">No posts found</p>
        <Link href="/admin/new">
          <Button>Create your first post</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left p-4 font-semibold">Title</th>
            <th className="text-left p-4 font-semibold min-w-[100px]">Status</th>
            <th className="text-left p-4 font-semibold min-w-[140px]">Updated</th>
            <th className="text-left p-4 font-semibold min-w-[140px]">Published</th>
            <th className="text-right p-4 font-semibold min-w-[200px]">Actions</th>
          </tr>
        </thead>
        <tbody>
          {posts.map((post) => (
            <PostRow key={post.slug} post={post} onUpdate={() => {
              // Refetch posts after update
              window.location.reload();
            }} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PostRow({ post, onUpdate }: { post: BlogPostRecord; onUpdate: () => void }) {
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState('');
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduledFor, setScheduledFor] = useState<string>('');

  const handleAction = async (action: 'publish' | 'archive' | 'delete' | 'unschedule') => {
    if (action === 'delete' && !confirm(`Delete "${post.title}"? This cannot be undone.`)) {
      return;
    }

    try {
      setActionLoading(true);
      setActionMessage('');
      
      const response = await fetch(`/api/admin/posts/${post.slug}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: post.version }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || `Failed to ${action} post`);
      }

      const actionLabel = 
        action === 'delete' ? 'Deleted' :
        action === 'publish' ? 'Published' :
        action === 'archive' ? 'Archived' :
        'Unscheduled';
      
      setActionMessage(`${actionLabel} successfully`);
      
      setTimeout(() => {
        onUpdate();
      }, 500);
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSchedule = async () => {
    if (!scheduledFor) {
      setActionMessage('Please select a date and time');
      return;
    }

    try {
      setActionLoading(true);
      setActionMessage('');
      
      const isoDate = new Date(scheduledFor).toISOString();
      
      const response = await fetch(`/api/admin/posts/${post.slug}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          version: post.version,
          scheduledFor: isoDate,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to schedule post');
      }

      setActionMessage('Scheduled successfully');
      setShowScheduleModal(false);
      
      setTimeout(() => {
        onUpdate();
      }, 500);
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setActionLoading(false);
    }
  };

  const statusColors = {
    draft: 'bg-muted text-muted-foreground',
    scheduled: 'bg-blue-500/10 text-blue-500',
    published: 'bg-green-500/10 text-green-500',
    archived: 'bg-orange-500/10 text-orange-500',
  };

  return (
    <tr className="border-b border-border hover:bg-muted/50 transition-colors">
      <td className="p-4">
        <div>
          <div className="font-medium">{post.title}</div>
          <div className="text-sm text-muted-foreground">/{post.slug}</div>
          {post.tags.length > 0 && (
            <div className="flex gap-1 mt-1 flex-wrap">
              {post.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </td>
      <td className="p-4">
        <div className="flex flex-col gap-1">
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
            statusColors[post.status]
          }`}
            title={
              post.status === 'scheduled' && post.scheduledFor
                ? `Scheduled for ${new Date(post.scheduledFor).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true,
                  })}`
                : undefined
            }
        >
          {post.status}
        </span>
          {post.status === 'scheduled' && post.scheduledFor && (
            <span className="text-xs text-muted-foreground">
              {new Date(post.scheduledFor).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true,
              })}
            </span>
          )}
        </div>
      </td>
      <td className="p-4 text-sm text-muted-foreground">
        {new Date(post.updatedAt).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })}
      </td>
      <td className="p-4 text-sm text-muted-foreground">
        {post.publishedAt
          ? new Date(post.publishedAt).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })
          : '—'}
      </td>
      <td className="p-4">
        <div className="flex justify-end gap-2 flex-wrap">
          <Link href={`/admin/${post.slug}`}>
            <Button size="sm" variant="outline" disabled={actionLoading}>
              Edit
            </Button>
          </Link>
          {post.status === 'published' && (
            <Link href={`/blog/${post.slug}`} target="_blank">
              <Button size="sm" variant="ghost" disabled={actionLoading}>
                View
              </Button>
            </Link>
          )}
          {post.status === 'draft' && (
            <>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setShowScheduleModal(true)}
                disabled={actionLoading}
              >
                Schedule
              </Button>
            <Button
              size="sm"
              variant="default"
              onClick={() => handleAction('publish')}
              disabled={actionLoading}
            >
              Publish
            </Button>
            </>
          )}
          {post.status === 'scheduled' && (
            <>
              <Button
                size="sm"
                variant="default"
                onClick={() => handleAction('publish')}
                disabled={actionLoading}
              >
                Publish Now
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => handleAction('unschedule')}
                disabled={actionLoading}
              >
                Unschedule
              </Button>
            </>
          )}
          {post.status === 'published' && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => handleAction('archive')}
              disabled={actionLoading}
            >
              Archive
            </Button>
          )}
          <Button
            size="sm"
            variant="destructive"
            onClick={() => handleAction('delete')}
            disabled={actionLoading}
          >
            Delete
          </Button>
        </div>
        {actionMessage && (
          <div
            className="mt-2 text-xs text-right"
            role="status"
            aria-live="polite"
          >
            {actionMessage}
          </div>
        )}
        {showScheduleModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-background border rounded-lg p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold mb-4">Schedule Post</h3>
              <div className="space-y-4">
                <div>
                  <label htmlFor={`schedule-${post.slug}`} className="block text-sm font-medium mb-2">
                    Select Date & Time
                  </label>
                  <input
                    id={`schedule-${post.slug}`}
                    type="datetime-local"
                    value={scheduledFor}
                    onChange={(e) => setScheduledFor(e.target.value)}
                    min={new Date().toISOString().slice(0, 16)}
                    className="w-full px-3 py-2 border rounded-md bg-background"
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setShowScheduleModal(false);
                      setScheduledFor('');
                    }}
                    disabled={actionLoading}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    variant="default"
                    onClick={handleSchedule}
                    disabled={actionLoading || !scheduledFor}
                  >
                    {actionLoading ? 'Scheduling...' : 'Schedule'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </td>
    </tr>
  );
}
