import { ArrowLeft, Calendar, Clock, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useGSAPStagger } from "@/hooks/useGSAP";
import { Link } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const blogPosts = [
  {
    id: 1,
    title: "How to Promote Your Music on Social Media in 2024",
    excerpt: "Discover the latest strategies and tips for promoting your music across TikTok, Instagram, and other social platforms.",
    image: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800&auto=format&fit=crop&q=60",
    category: "Marketing",
    date: "Dec 15, 2024",
    readTime: "5 min read",
  },
  {
    id: 2,
    title: "Understanding Music Royalties: A Complete Guide",
    excerpt: "Learn everything about streaming royalties, mechanical royalties, and how to maximize your earnings as an independent artist.",
    image: "https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=800&auto=format&fit=crop&q=60",
    category: "Education",
    date: "Dec 12, 2024",
    readTime: "8 min read",
  },
  {
    id: 3,
    title: "Top 10 Mistakes New Artists Make When Releasing Music",
    excerpt: "Avoid these common pitfalls and set yourself up for success with your next release.",
    image: "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=800&auto=format&fit=crop&q=60",
    category: "Tips",
    date: "Dec 10, 2024",
    readTime: "6 min read",
  },
  {
    id: 4,
    title: "Building Your Brand as an Independent Artist",
    excerpt: "Create a memorable brand identity that resonates with your audience and helps you stand out in a crowded market.",
    image: "https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=800&auto=format&fit=crop&q=60",
    category: "Branding",
    date: "Dec 8, 2024",
    readTime: "7 min read",
  },
  {
    id: 5,
    title: "The Complete Guide to Music Distribution",
    excerpt: "Everything you need to know about getting your music on streaming platforms and reaching a global audience.",
    image: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=800&auto=format&fit=crop&q=60",
    category: "Distribution",
    date: "Dec 5, 2024",
    readTime: "10 min read",
  },
  {
    id: 6,
    title: "How to Earn 90% Royalties with TrackSyra",
    excerpt: "Maximize your earnings with our transparent royalty structure. Learn how independent artists keep more of what they earn.",
    image: "https://images.unsplash.com/photo-1526142684086-7ebd69df27a5?w=800&auto=format&fit=crop&q=60",
    category: "Earnings",
    date: "Dec 3, 2024",
    readTime: "4 min read",
  },
];

const Blog = () => {
  const containerRef = useGSAPStagger();

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pt-24 pb-16">
        <div className="container mx-auto px-4">
          {/* Header */}
          <div className="mb-12">
            <Link to="/">
              <Button variant="ghost" className="mb-6 group">
                <ArrowLeft className="w-4 h-4 mr-2 transition-transform group-hover:-translate-x-1" />
                Back to Home
              </Button>
            </Link>
            <h1 className="text-4xl sm:text-5xl font-bold mb-4 text-foreground">
              Our <span className="gradient-text">Blog</span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl">
              Tips, insights, and industry news to help you grow your music career and maximize your earnings.
            </p>
          </div>

          {/* Search */}
          <div className="relative max-w-md mb-12">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input 
              placeholder="Search articles..." 
              className="pl-10 h-12"
            />
          </div>

          {/* Blog Grid */}
          <div ref={containerRef} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {blogPosts.map((post) => (
              <article
                key={post.id}
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
      </main>
      <Footer />
    </div>
  );
};

export default Blog;
