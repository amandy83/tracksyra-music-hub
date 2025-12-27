import { ArrowRight, Calendar, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGSAPStagger } from "@/hooks/useGSAP";
import { Link } from "react-router-dom";

const blogPosts = [
  {
    title: "How to Promote Your Music on Social Media in 2024",
    excerpt: "Discover the latest strategies and tips for promoting your music across TikTok, Instagram, and other social platforms.",
    image: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800&auto=format&fit=crop&q=60",
    category: "Marketing",
    date: "Dec 15, 2024",
    readTime: "5 min read",
  },
  {
    title: "Understanding Music Royalties: A Complete Guide",
    excerpt: "Learn everything about streaming royalties, mechanical royalties, and how to maximize your earnings as an independent artist.",
    image: "https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=800&auto=format&fit=crop&q=60",
    category: "Education",
    date: "Dec 12, 2024",
    readTime: "8 min read",
  },
  {
    title: "Top 10 Mistakes New Artists Make When Releasing Music",
    excerpt: "Avoid these common pitfalls and set yourself up for success with your next release.",
    image: "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=800&auto=format&fit=crop&q=60",
    category: "Tips",
    date: "Dec 10, 2024",
    readTime: "6 min read",
  },
];

const BlogSection = () => {
  const containerRef = useGSAPStagger();

  return (
    <section id="blog" className="py-16 bg-background">
      <div className="container mx-auto px-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-10">
          <div>
            <h2 className="text-3xl sm:text-4xl font-bold mb-3 text-foreground">
              Latest from
              <span className="gradient-text"> Our Blog</span>
            </h2>
            <p className="text-muted-foreground max-w-xl">
              Tips, insights, and industry news to help you grow your music career.
            </p>
          </div>
          <Link to="/blog">
            <Button variant="outline" className="group">
              View All Posts
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </Button>
          </Link>
        </div>

        <div ref={containerRef} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {blogPosts.map((post, index) => (
            <article
              key={index}
              className="gsap-stagger group bg-card rounded-2xl overflow-hidden border border-border hover:shadow-xl hover:border-primary/30 transition-all duration-300"
            >
              <div className="aspect-video overflow-hidden">
                <img
                  src={post.image}
                  alt={post.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
              </div>
              <div className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <span className="px-3 py-1 text-xs font-medium bg-primary/10 text-primary rounded-full">
                    {post.category}
                  </span>
                </div>
                <h3 className="text-lg font-bold mb-2 text-foreground group-hover:text-primary transition-colors line-clamp-2">
                  {post.title}
                </h3>
                <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                  {post.excerpt}
                </p>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {post.date}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {post.readTime}
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};

export default BlogSection;
