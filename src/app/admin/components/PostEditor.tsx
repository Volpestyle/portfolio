'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MarkdownEditor } from './MarkdownEditor';
import { MediaUploader } from './MediaUploader';
import type { BlogPostRecord, BlogPostWithContent } from '@/types/blog';

interface PostEditorProps {
  post?: BlogPostWithContent;
}

export function PostEditor({ post }: PostEditorProps) {
  const router = useRouter();
  const isNew = !post;

  const [formData, setFormData] = useState({
    title: post?.title || '',
    slug: post?.slug || '',
    summary: post?.summary || '',
    tags: post?.tags?.join(', ') || '',
    heroImageKey: post?.heroImageKey || '',
    content: post?.content || '',
    version: post?.version ?? 1,
  });

  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [unscheduling, setUnscheduling] = useState(false);
  const [message, setMessage] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [showMediaUploader, setShowMediaUploader] = useState(false);
  const [scheduledFor, setScheduledFor] = useState<string>('');

  // Auto-generate slug from title
  useEffect(() => {
    if (isNew && formData.title && !formData.slug) {
      const autoSlug = formData.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
      setFormData((prev) => ({ ...prev, slug: autoSlug }));
    }
  }, [formData.title, formData.slug, isNew]);

  const handleSave = useCallback(
    async (shouldPublish = false) => {
      try {
        if (shouldPublish) {
          setPublishing(true);
        } else {
          setSaving(true);
        }
        setMessage('');

        // Validate
        if (!formData.title || !formData.slug || !formData.summary) {
          throw new Error('Title, slug, and summary are required');
        }

        const payload = {
          title: formData.title,
          slug: formData.slug,
          summary: formData.summary,
          tags: formData.tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
          heroImageKey: formData.heroImageKey || undefined,
          content: formData.content,
          version: formData.version,
        };

        if (!isNew && post.slug !== payload.slug) {
          throw new Error('Slug cannot be changed after creation');
        }

        const endpoint = isNew ? '/api/admin/posts' : `/api/admin/posts/${post.slug}`;

        const method = isNew ? 'POST' : 'PUT';

        const response = await fetch(endpoint, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || 'Failed to save post');
        }

        const result = await response.json();

        if (result.version) {
          setFormData((prev) => ({ ...prev, version: result.version }));
        } else if (result.post?.version) {
          setFormData((prev) => ({ ...prev, version: result.post.version }));
        }

        if (shouldPublish) {
          // Publish the post
          const publishResponse = await fetch(`/api/admin/posts/${result.slug}/publish`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ version: result.version ?? result.post?.version ?? formData.version }),
          });

          if (!publishResponse.ok) {
            const error = await publishResponse.json();
            throw new Error(error.message || 'Failed to publish post');
          }

          setMessage('Published successfully! Redirecting...');
          setTimeout(() => router.push('/admin'), 1000);
        } else {
          setMessage('Saved as draft');
          if (isNew) {
            // Redirect to edit page for the new post
            setTimeout(() => router.push(`/admin/${result.slug}`), 1000);
          }
        }
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setSaving(false);
        setPublishing(false);
      }
    },
    [formData, isNew, post?.slug, router]
  );

  const handlePreview = useCallback(() => {
    // Open draft mode preview in new tab
    const previewUrl = `/api/draft?slug=${post?.slug || formData.slug}&redirect=/blog/${post?.slug || formData.slug}`;
    window.open(previewUrl, '_blank');
  }, [formData.slug, post?.slug]);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey)) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === 's') {
        event.preventDefault();
        if (!saving && !publishing) {
          void handleSave(false);
        }
      } else if (key === 'p') {
        event.preventDefault();
        if (!isNew && (post?.slug || formData.slug)) {
          handlePreview();
        }
      }
    }

    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [handleSave, handlePreview, saving, publishing, isNew, post?.slug, formData.slug]);

  const handleMediaInsert = (key: string) => {
    const imageUrl = `/media/${key}`;
    const markdownImage = `![Image description](${imageUrl})`;
    setFormData((prev) => ({
      ...prev,
      content: prev.content + '\n' + markdownImage,
    }));
    setShowMediaUploader(false);
  };

  const handleSchedule = useCallback(async () => {
    try {
      setScheduling(true);
      setMessage('');

      if (!scheduledFor) {
        throw new Error('Please select a date and time for scheduling');
      }

      // Convert to ISO string if needed
      const isoDate = new Date(scheduledFor).toISOString();

      const response = await fetch(`/api/admin/posts/${post?.slug || formData.slug}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: formData.version,
          scheduledFor: isoDate,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to schedule post');
      }

      const result = await response.json();
      if (result.post?.version) {
        setFormData((prev) => ({ ...prev, version: result.post.version }));
      }

      setMessage(`Post scheduled for ${new Date(isoDate).toLocaleString()}`);
      setTimeout(() => router.push('/admin'), 1500);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setScheduling(false);
    }
  }, [scheduledFor, formData.slug, formData.version, post?.slug, router]);

  const handleUnschedule = useCallback(async () => {
    try {
      setUnscheduling(true);
      setMessage('');

      const response = await fetch(`/api/admin/posts/${post?.slug}/unschedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: formData.version,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to unschedule post');
      }

      const result = await response.json();
      if (result.post?.version) {
        setFormData((prev) => ({ ...prev, version: result.post.version }));
      }

      setMessage('Post unscheduled successfully');
      setTimeout(() => router.push('/admin'), 1500);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setUnscheduling(false);
    }
  }, [formData.version, post?.slug, router]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{isNew ? 'New Post' : 'Edit Post'}</h1>
          {!isNew && (
            <p className="mt-1 text-muted-foreground">
              Status: <span className="font-medium capitalize">{post.status}</span>
            </p>
          )}
        </div>
        <Link href="/admin">
          <Button variant="outline">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="mr-2 h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Posts
          </Button>
        </Link>
      </div>

      {/* Status Message */}
      {message && (
        <div
          className={`rounded-lg border p-4 ${
            message.includes('error') || message.includes('Failed')
              ? 'border-destructive/50 bg-destructive/10 text-destructive'
              : 'border-green-500/50 bg-green-500/10 text-green-500'
          }`}
          role="alert"
          aria-live="polite"
        >
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Main Editor */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Post Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Title */}
              <div>
                <label htmlFor="title" className="mb-2 block text-sm font-medium">
                  Title <span className="text-destructive">*</span>
                </label>
                <Input
                  id="title"
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Enter post title"
                  className="text-lg"
                  required
                />
              </div>

              {/* Slug */}
              <div>
                <label htmlFor="slug" className="mb-2 block text-sm font-medium">
                  Slug <span className="text-destructive">*</span>
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">/blog/</span>
                  <Input
                    id="slug"
                    type="text"
                    value={formData.slug}
                    onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                    placeholder="post-slug"
                    pattern="[a-z0-9-]+"
                    required
                    disabled={!isNew}
                    maxLength={48}
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Only lowercase letters, numbers, and hyphens{!isNew ? ' (slug is locked after creation)' : ''}
                </p>
              </div>

              {/* Summary */}
              <div>
                <label htmlFor="summary" className="mb-2 block text-sm font-medium">
                  Summary <span className="text-destructive">*</span>
                </label>
                <Textarea
                  id="summary"
                  value={formData.summary}
                  onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
                  placeholder="Brief summary of the post"
                  rows={3}
                  required
                />
              </div>

              {/* Tags */}
              <div>
                <label htmlFor="tags" className="mb-2 block text-sm font-medium">
                  Tags
                </label>
                <Input
                  id="tags"
                  type="text"
                  value={formData.tags}
                  onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                  placeholder="react, typescript, web-dev (comma-separated)"
                />
                <p className="mt-1 text-xs text-muted-foreground">Comma-separated list of tags</p>
              </div>

              {/* Hero Image */}
              <div>
                <label htmlFor="heroImage" className="mb-2 block text-sm font-medium">
                  Hero Image Key
                </label>
                <Input
                  id="heroImage"
                  type="text"
                  value={formData.heroImageKey}
                  onChange={(e) => setFormData({ ...formData, heroImageKey: e.target.value })}
                  placeholder="images/2025/01/hero.jpg"
                />
                <p className="mt-1 text-xs text-muted-foreground">S3 key for the hero image</p>
              </div>
            </CardContent>
          </Card>

          {/* Content Editor */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Content</CardTitle>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowPreview(!showPreview)}>
                  {showPreview ? 'Edit' : 'Preview'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowMediaUploader(!showMediaUploader)}
                >
                  Add Media
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <MarkdownEditor
                value={formData.content}
                onChange={(content) => setFormData({ ...formData, content })}
                showPreview={showPreview}
              />
            </CardContent>
          </Card>

          {/* Media Uploader */}
          {showMediaUploader && (
            <MediaUploader onInsert={handleMediaInsert} onClose={() => setShowMediaUploader(false)} />
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                onClick={() => handleSave(false)}
                disabled={saving || publishing || scheduling || unscheduling}
                className="w-full"
                variant="outline"
              >
                {saving ? 'Saving...' : 'Save Draft'}
              </Button>

              {!isNew && post.status === 'draft' && (
                <Button
                  onClick={handlePreview}
                  disabled={saving || publishing || scheduling || unscheduling}
                  className="w-full"
                  variant="secondary"
                >
                  Preview Draft
                </Button>
              )}

              <Button
                onClick={() => handleSave(true)}
                disabled={saving || publishing || scheduling || unscheduling}
                className="w-full"
              >
                {publishing ? 'Publishing...' : 'Publish Now'}
              </Button>

              {!isNew && (
                <Link href={`/blog/${post.slug}`} target="_blank" className="block">
                  <Button variant="ghost" className="w-full">
                    View Live
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>

          {/* Scheduling */}
          {!isNew && (
            <Card>
              <CardHeader>
                <CardTitle>Schedule Publishing</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {post.status === 'scheduled' && post.scheduledFor && (
                  <div className="mb-3 rounded-md border border-blue-500/50 bg-blue-500/10 p-3">
                    <p className="mb-1 text-xs font-medium text-blue-500">Currently Scheduled</p>
                    <p className="text-sm text-foreground">
                      {new Date(post.scheduledFor).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true,
                      })}
                    </p>
                  </div>
                )}

                {post.status !== 'scheduled' && (
                  <>
                    <div>
                      <label htmlFor="scheduleDate" className="mb-2 block text-sm font-medium">
                        Schedule Date & Time
                      </label>
                      <Input
                        id="scheduleDate"
                        type="datetime-local"
                        value={scheduledFor}
                        onChange={(e) => setScheduledFor(e.target.value)}
                        disabled={scheduling || unscheduling}
                        min={new Date().toISOString().slice(0, 16)}
                      />
                      <p className="mt-1 text-xs text-muted-foreground">
                        Post will be published automatically at this time
                      </p>
                    </div>

                    <Button
                      onClick={handleSchedule}
                      disabled={saving || publishing || scheduling || unscheduling || !scheduledFor}
                      className="w-full"
                      variant="default"
                    >
                      {scheduling ? 'Scheduling...' : 'Schedule Publish'}
                    </Button>
                  </>
                )}

                {post.status === 'scheduled' && (
                  <Button
                    onClick={handleUnschedule}
                    disabled={saving || publishing || scheduling || unscheduling}
                    className="w-full"
                    variant="destructive"
                  >
                    {unscheduling ? 'Unscheduling...' : 'Unschedule'}
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {/* Post Info */}
          {!isNew && (
            <Card>
              <CardHeader>
                <CardTitle>Post Info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Created:</span>
                  <br />
                  {new Date(post.updatedAt).toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </div>
                {post.publishedAt && (
                  <div>
                    <span className="text-muted-foreground">Published:</span>
                    <br />
                    {new Date(post.publishedAt).toLocaleDateString('en-US', {
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </div>
                )}
                <div>
                  <span className="text-muted-foreground">Version:</span> {formData.version}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Keyboard Shortcuts */}
          <Card>
            <CardHeader>
              <CardTitle>Keyboard Shortcuts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Save Draft:</span>
                <kbd className="rounded bg-muted px-2 py-1">⌘ + S</kbd>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Preview:</span>
                <kbd className="rounded bg-muted px-2 py-1">⌘ + P</kbd>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
