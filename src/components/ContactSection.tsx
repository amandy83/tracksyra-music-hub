import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { gsap } from "@/hooks/useGSAP";
import { Send, Music2, BookOpen, Scale } from "lucide-react";
import { z } from "zod";

// Paste your Web3Forms access key here
const WEB3FORMS_ACCESS_KEY = "YOUR_ACCESS_KEY_HERE";

const COUNTRIES = [
  "Afghanistan","Albania","Algeria","Andorra","Angola","Antarctica","Antigua & Barbuda","Argentina","Armenia","Aruba","Australia","Austria","Azerbaijan","Bahamas","Bahrain","Bangladesh","Barbados","Belarus","Belgium","Belize","Benin","Bermuda","Bhutan","Bolivia","Bosnia & Herzegovina","Botswana","Bouvet Island","Brazil","British Indian Ocean Territory","Brunei","Bulgaria","Burkina Faso","Burundi","Cambodia","Cameroon","Canada","Canary Islands","Cape Verde","Caribbean Netherlands","Cayman Islands","Central African Republic","Ceuta & Melilla","Chad","Chile","China","Christmas Island","Clipperton Island","Cocos (Keeling) Islands","Colombia","Comoros","Congo – Brazzaville","Congo – Kinshasa","Cook Islands","Costa Rica","Croatia","Curaçao","Cyprus","Czech Republic","Côte d'Ivoire","Denmark","Diego Garcia","Djibouti","Dominican Republic","Ecuador","Egypt","El Salvador","Equatorial Guinea","Eritrea","Estonia","Eswatini","Ethiopia","Falkland Islands","Faroe Islands","Finland","France","French Guiana","French Polynesia","French Southern Territories","Gabon","Gambia","Georgia","Germany","Ghana","Gibraltar","Greece","Greenland","Grenada","Guadeloupe","Guatemala","Guernsey","Guinea","Guinea-Bissau","Guyana","Haiti","Heard & McDonald Islands","Honduras","Hong Kong","Hungary","Iceland","India","Indonesia","Iraq","Ireland","Isle of Man","Israel","Italy","Jamaica","Japan","Jersey","Jordan","Kazakhstan","Kenya","Kiribati","Kosovo","Kuwait","Kyrgyzstan","Laos","Latvia","Lebanon","Lesotho","Liberia","Libya","Liechtenstein","Lithuania","Luxembourg","Macao","Madagascar","Malawi","Malaysia","Maldives","Mali","Malta","Marshall Islands","Martinique","Mauritania","Mauritius","Mayotte","Mexico","Micronesia","Moldova, Republic of","Monaco","Mongolia","Montenegro","Montserrat","Morocco","Mozambique","Myanmar (Burma)","Namibia","Nauru","Nepal","Netherlands","Netherlands Antilles","New Caledonia","New Zealand","Nicaragua","Niger","Nigeria","Niue","Norfolk Island","Northern Mariana Islands","North Macedonia","Norway","Oman","Outlying Oceania","Pakistan","Palau","Palestinian Territories","Papua New Guinea","Paraguay","Peru","Philippines","Pitcairn Islands","Poland","Portugal","Puerto Rico","Qatar","Romania","Russia","Rwanda","Réunion","San Marino","Saudi Arabia","Senegal","Serbia","Sierra Leone","Singapore","Sint Maarten","Slovakia","Slovenia","Solomon Islands","Somalia","South Africa","South Georgia & South Sandwich Islands","South Korea","South Sudan","Spain","Sri Lanka","Saint Barthélemy","Saint Helena, Ascension and Tristan Da Cunha","Saint Kitts & Nevis","Saint Lucia","Saint Martin","Saint Pierre & Miquelon","Saint Vincent & The Grenadines","Sudan","Suriname","Svalbard & Jan Mayen","Sweden","Switzerland","São Tomé & Príncipe","Taiwan","Tajikistan","Tanzania","Thailand","Timor-Leste","Togo","Tokelau","Tonga","Trinidad & Tobago","Tristan da Cunha","Tunisia","Turkey","Turkmenistan","Turks & Caicos Islands","Tuvalu","U.S. Outlying Islands","Uganda","Ukraine","United Arab Emirates","United Kingdom","United States","Uruguay","Uzbekistan","Vatican City","Venezuela","Vietnam","Wallis & Futuna","Western Sahara","Yemen","Zambia","Zimbabwe","Åland Islands"
];

const GENRES = [
  "African","Alternative","Arabic","Asian – Other Regional Genres","Blues","Brazilian – MPB Pop","Brazilian – Other Regional Genres","Brazilian – Piseiro/Forró","Brazilian – Sertanejo","Children Music","Christian & Gospel","Classical","Country","Dance","Douyin Hot Tracks","Easy Listening","Electronic","Folk","Hip Hop/Rap","Indian – Bollywood","Indian – Other Regional Genres","Indian – Punjabi","Indonesian – Dandgut","Indonesian – Other Regional Genres","Instrumental","Jazz","J-pop","Latin","K-pop","Lo-Fi","Metal","Pop","R&B/Soul","Reggae","Relaxation","Regional Mexican","Rock","Various","Religious","World Music / Regional Folklore","Schlager","Soundtracks","Spoken Words","Thailand & Laos Regional"
];

const DISTRIBUTORS = [
  "ADA","AWAL","DISTROKID","FINE TUNES","FUGA","IDOL","INGROOVES","KOBALT","KONTOR","LOCAL INDIE (Pias, Wagram, Because…)","MAJOR – SONY","MAJOR – UNIVERSAL","MAJOR – WARNER","ONE RPM","THE ORCHARD","TUNECORE","OTHER","NOT DISTRIBUTED"
];

/* ---------- Schemas ---------- */
const artistSchema = z.object({
  role: z.enum(["Artist", "Label", "Songwriter & Publisher"]),
  firstName: z.string().trim().min(1, "Required").max(100),
  lastName: z.string().trim().min(1, "Required").max(100),
  email: z.string().trim().email("Invalid email").max(255),
  phone: z.string().trim().min(5, "Required").max(30),
  country: z.string().min(1, "Required"),
  city: z.string().trim().min(1, "Required").max(100),
  artistName: z.string().trim().min(1, "Required").max(150),
  genre: z.string().min(1, "Required"),
  distributor: z.string().min(1, "Required"),
  trackCount: z.string().min(1, "Required"),
  firstReleaseDate: z.string().min(1, "Required"),
  lastReleaseDate: z.string().optional(),
  privateLink: z.string().url("Invalid URL").optional().or(z.literal("")),
  streamingPlatform: z.string().min(1, "Required"),
  monthlyListeners: z.string().min(1, "Required"),
  socials: z.string().optional(),
  privacyAccepted: z.literal(true, { errorMap: () => ({ message: "You must accept the privacy policy" }) }),
});

const publisherSchema = z.object({
  firstName: z.string().trim().min(1, "Required").max(100),
  lastName: z.string().trim().min(1, "Required").max(100),
  email: z.string().trim().email("Invalid email").max(255),
  company: z.string().trim().min(1, "Required").max(200),
  country: z.string().min(1, "Required"),
  message: z.string().trim().min(10, "Min 10 characters").max(2000),
  privacyAccepted: z.literal(true, { errorMap: () => ({ message: "You must accept the privacy policy" }) }),
});

const legalSchema = z.object({
  firstName: z.string().trim().min(1, "Required").max(100),
  lastName: z.string().trim().min(1, "Required").max(100),
  email: z.string().trim().email("Invalid email").max(255),
  issueType: z.string().min(1, "Required"),
  description: z.string().trim().min(20, "Min 20 characters").max(3000),
  privacyAccepted: z.literal(true, { errorMap: () => ({ message: "You must accept the privacy policy" }) }),
});

/* ---------- Helpers ---------- */
const submitToWeb3Forms = async (payload: Record<string, unknown>) => {
  const res = await fetch("https://api.web3forms.com/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ access_key: WEB3FORMS_ACCESS_KEY, from_name: "TrackSyra Contact Form", ...payload }),
  });
  return res.json();
};

const FieldError = ({ msg }: { msg?: string }) =>
  msg ? <p className="text-xs text-destructive mt-1">{msg}</p> : null;

const StepBadge = ({ n, label }: { n: string; label: string }) => (
  <div className="flex items-center gap-3 mb-4">
    <span className="text-xs font-mono text-muted-foreground">({n})</span>
    <h3 className="text-base font-semibold text-foreground">{label}</h3>
    <div className="flex-1 h-px bg-border" />
  </div>
);

/* ---------- ARTIST FORM ---------- */
const ArtistForm = () => {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [data, setData] = useState({
    role: "Artist",
    firstName: "", lastName: "", email: "", phone: "", country: "", city: "",
    artistName: "", genre: "", distributor: "", trackCount: "",
    firstReleaseDate: "", lastReleaseDate: "", privateLink: "",
    streamingPlatform: "Spotify", monthlyListeners: "", socials: "",
    privacyAccepted: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const update = (k: string, v: string | boolean) => {
    setData((p) => ({ ...p, [k]: v }));
    if (errors[k]) setErrors((p) => ({ ...p, [k]: "" }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!WEB3FORMS_ACCESS_KEY || WEB3FORMS_ACCESS_KEY === "YOUR_ACCESS_KEY_HERE") {
      toast({ title: "API Key Required", description: "Please add your Web3Forms access key in the code.", variant: "destructive" });
      return;
    }
    const result = artistSchema.safeParse(data);
    if (!result.success) {
      const fe: Record<string, string> = {};
      result.error.errors.forEach((er) => { fe[er.path[0] as string] = er.message; });
      setErrors(fe);
      toast({ title: "Please fix errors", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const res = await submitToWeb3Forms({ form_type: "Artist/Label/Songwriter", ...data });
      if (res.success) {
        toast({ title: "Submitted!", description: "We'll get back to you soon." });
        setData((p) => ({ ...p, firstName: "", lastName: "", email: "", phone: "", city: "", artistName: "", privateLink: "", socials: "", privacyAccepted: false }));
      } else throw new Error();
    } catch {
      toast({ title: "Error", description: "Failed to submit. Try again.", variant: "destructive" });
    } finally { setSubmitting(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-8">
      {/* Step 01 */}
      <div>
        <StepBadge n="01" label="About You" />
        <div className="space-y-5">
          <div>
            <Label className="mb-2 block">You are*</Label>
            <RadioGroup value={data.role} onValueChange={(v) => update("role", v)} className="flex flex-wrap gap-4">
              {["Artist", "Label", "Songwriter & Publisher"].map((r) => (
                <div key={r} className="flex items-center gap-2">
                  <RadioGroupItem value={r} id={`role-${r}`} />
                  <Label htmlFor={`role-${r}`} className="cursor-pointer">{r}</Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="firstName">First name*</Label>
              <Input id="firstName" value={data.firstName} onChange={(e) => update("firstName", e.target.value)} className="mt-1" />
              <FieldError msg={errors.firstName} />
            </div>
            <div>
              <Label htmlFor="lastName">Last name*</Label>
              <Input id="lastName" value={data.lastName} onChange={(e) => update("lastName", e.target.value)} className="mt-1" />
              <FieldError msg={errors.lastName} />
            </div>
            <div>
              <Label htmlFor="email">Email*</Label>
              <Input id="email" type="email" value={data.email} onChange={(e) => update("email", e.target.value)} className="mt-1" />
              <FieldError msg={errors.email} />
            </div>
            <div>
              <Label htmlFor="phone">Phone*</Label>
              <Input id="phone" type="tel" value={data.phone} onChange={(e) => update("phone", e.target.value)} className="mt-1" />
              <FieldError msg={errors.phone} />
            </div>
            <div>
              <Label>Country*</Label>
              <Select value={data.country} onValueChange={(v) => update("country", v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent className="max-h-72 bg-background">
                  {COUNTRIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <FieldError msg={errors.country} />
            </div>
            <div>
              <Label htmlFor="city">City*</Label>
              <Input id="city" value={data.city} onChange={(e) => update("city", e.target.value)} className="mt-1" />
              <FieldError msg={errors.city} />
            </div>
          </div>
        </div>
      </div>

      {/* Step 02 */}
      <div>
        <StepBadge n="02" label="Your Music" />
        <div className="space-y-5">
          <div>
            <Label htmlFor="artistName">Your name (Artist, Band, Label)*</Label>
            <Input id="artistName" value={data.artistName} onChange={(e) => update("artistName", e.target.value)} className="mt-1" />
            <FieldError msg={errors.artistName} />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label>Main music genre*</Label>
              <Select value={data.genre} onValueChange={(v) => update("genre", v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent className="max-h-72 bg-background">
                  {GENRES.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
              <FieldError msg={errors.genre} />
            </div>
            <div>
              <Label>Current distributor*</Label>
              <Select value={data.distributor} onValueChange={(v) => update("distributor", v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent className="max-h-72 bg-background">
                  {DISTRIBUTORS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
              <FieldError msg={errors.distributor} />
            </div>
            <div>
              <Label>Number of tracks released*</Label>
              <Select value={data.trackCount} onValueChange={(v) => update("trackCount", v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent className="bg-background">
                  {["0 – 5", "6 – 50", "51 – 100", "> 100"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
              <FieldError msg={errors.trackCount} />
            </div>
            <div>
              <Label htmlFor="firstReleaseDate">Date of 1st release*</Label>
              <Input id="firstReleaseDate" type="date" value={data.firstReleaseDate} onChange={(e) => update("firstReleaseDate", e.target.value)} className="mt-1" />
              <FieldError msg={errors.firstReleaseDate} />
            </div>
            <div>
              <Label htmlFor="lastReleaseDate">Date of last release</Label>
              <Input id="lastReleaseDate" type="date" value={data.lastReleaseDate} onChange={(e) => update("lastReleaseDate", e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="privateLink">Private link for your next release</Label>
              <Input id="privateLink" type="url" placeholder="https://..." value={data.privateLink} onChange={(e) => update("privateLink", e.target.value)} className="mt-1" />
              <FieldError msg={errors.privateLink} />
            </div>
            <div>
              <Label>Streaming platform</Label>
              <Select value={data.streamingPlatform} onValueChange={(v) => update("streamingPlatform", v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-background">
                  {["Spotify", "Apple Music", "YouTube Music", "JioSaavn", "Gaana", "Other"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Total monthly listeners*</Label>
              <Select value={data.monthlyListeners} onValueChange={(v) => update("monthlyListeners", v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent className="bg-background">
                  {["0 – 1K", "1K – 10K", "10K – 100K", "> 100K"].map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
              <FieldError msg={errors.monthlyListeners} />
            </div>
          </div>
          <div>
            <Label htmlFor="socials">Your social media presence (Instagram, Facebook, TikTok, YouTube, etc.)</Label>
            <Textarea id="socials" placeholder="@yourhandle on Instagram, etc." value={data.socials} onChange={(e) => update("socials", e.target.value)} className="mt-1 min-h-[80px]" />
          </div>
        </div>
      </div>

      <div className="flex items-start gap-3">
        <Checkbox id="privacy-artist" checked={data.privacyAccepted} onCheckedChange={(v) => update("privacyAccepted", !!v)} />
        <Label htmlFor="privacy-artist" className="text-sm leading-relaxed cursor-pointer">
          I declare that I have read TrackSyra's Privacy Protection Policy*
        </Label>
      </div>
      <FieldError msg={errors.privacyAccepted} />

      <Button type="submit" variant="hero" size="xl" className="w-full" disabled={submitting}>
        {submitting ? "Sending..." : (<>Submit <Send className="w-5 h-5" /></>)}
      </Button>
    </form>
  );
};

/* ---------- PUBLISHER FORM ---------- */
const PublisherForm = () => {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [data, setData] = useState({ firstName: "", lastName: "", email: "", company: "", country: "", message: "", privacyAccepted: false });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const update = (k: string, v: string | boolean) => {
    setData((p) => ({ ...p, [k]: v }));
    if (errors[k]) setErrors((p) => ({ ...p, [k]: "" }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!WEB3FORMS_ACCESS_KEY || WEB3FORMS_ACCESS_KEY === "YOUR_ACCESS_KEY_HERE") {
      toast({ title: "API Key Required", description: "Please add your Web3Forms access key in the code.", variant: "destructive" });
      return;
    }
    const r = publisherSchema.safeParse(data);
    if (!r.success) {
      const fe: Record<string, string> = {};
      r.error.errors.forEach((er) => { fe[er.path[0] as string] = er.message; });
      setErrors(fe);
      return;
    }
    setSubmitting(true);
    try {
      const res = await submitToWeb3Forms({ form_type: "Publisher Inquiry", ...data });
      if (res.success) {
        toast({ title: "Submitted!", description: "We'll be in touch soon." });
        setData({ firstName: "", lastName: "", email: "", company: "", country: "", message: "", privacyAccepted: false });
      } else throw new Error();
    } catch {
      toast({ title: "Error", variant: "destructive" });
    } finally { setSubmitting(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="p-fn">First name*</Label>
          <Input id="p-fn" value={data.firstName} onChange={(e) => update("firstName", e.target.value)} className="mt-1" />
          <FieldError msg={errors.firstName} />
        </div>
        <div>
          <Label htmlFor="p-ln">Last name*</Label>
          <Input id="p-ln" value={data.lastName} onChange={(e) => update("lastName", e.target.value)} className="mt-1" />
          <FieldError msg={errors.lastName} />
        </div>
        <div>
          <Label htmlFor="p-em">Email*</Label>
          <Input id="p-em" type="email" value={data.email} onChange={(e) => update("email", e.target.value)} className="mt-1" />
          <FieldError msg={errors.email} />
        </div>
        <div>
          <Label htmlFor="p-co">Company / Publisher Name*</Label>
          <Input id="p-co" value={data.company} onChange={(e) => update("company", e.target.value)} className="mt-1" />
          <FieldError msg={errors.company} />
        </div>
        <div className="sm:col-span-2">
          <Label>Country*</Label>
          <Select value={data.country} onValueChange={(v) => update("country", v)}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent className="max-h-72 bg-background">
              {COUNTRIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <FieldError msg={errors.country} />
        </div>
      </div>
      <div>
        <Label htmlFor="p-msg">Tell us about your catalog & needs*</Label>
        <Textarea id="p-msg" value={data.message} onChange={(e) => update("message", e.target.value)} className="mt-1 min-h-[120px]" />
        <FieldError msg={errors.message} />
      </div>
      <div className="flex items-start gap-3">
        <Checkbox id="privacy-pub" checked={data.privacyAccepted} onCheckedChange={(v) => update("privacyAccepted", !!v)} />
        <Label htmlFor="privacy-pub" className="text-sm leading-relaxed cursor-pointer">
          I declare that I have read TrackSyra's Privacy Protection Policy*
        </Label>
      </div>
      <FieldError msg={errors.privacyAccepted} />
      <Button type="submit" variant="hero" size="xl" className="w-full" disabled={submitting}>
        {submitting ? "Sending..." : (<>Submit <Send className="w-5 h-5" /></>)}
      </Button>
    </form>
  );
};

/* ---------- LEGAL FORM ---------- */
const LegalForm = () => {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [data, setData] = useState({ firstName: "", lastName: "", email: "", issueType: "", description: "", privacyAccepted: false });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const update = (k: string, v: string | boolean) => {
    setData((p) => ({ ...p, [k]: v }));
    if (errors[k]) setErrors((p) => ({ ...p, [k]: "" }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!WEB3FORMS_ACCESS_KEY || WEB3FORMS_ACCESS_KEY === "YOUR_ACCESS_KEY_HERE") {
      toast({ title: "API Key Required", description: "Please add your Web3Forms access key in the code.", variant: "destructive" });
      return;
    }
    const r = legalSchema.safeParse(data);
    if (!r.success) {
      const fe: Record<string, string> = {};
      r.error.errors.forEach((er) => { fe[er.path[0] as string] = er.message; });
      setErrors(fe);
      return;
    }
    setSubmitting(true);
    try {
      const res = await submitToWeb3Forms({ form_type: "Legal Issue", ...data });
      if (res.success) {
        toast({ title: "Submitted!", description: "Our legal team will review and respond." });
        setData({ firstName: "", lastName: "", email: "", issueType: "", description: "", privacyAccepted: false });
      } else throw new Error();
    } catch {
      toast({ title: "Error", variant: "destructive" });
    } finally { setSubmitting(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="l-fn">First name*</Label>
          <Input id="l-fn" value={data.firstName} onChange={(e) => update("firstName", e.target.value)} className="mt-1" />
          <FieldError msg={errors.firstName} />
        </div>
        <div>
          <Label htmlFor="l-ln">Last name*</Label>
          <Input id="l-ln" value={data.lastName} onChange={(e) => update("lastName", e.target.value)} className="mt-1" />
          <FieldError msg={errors.lastName} />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="l-em">Email*</Label>
          <Input id="l-em" type="email" value={data.email} onChange={(e) => update("email", e.target.value)} className="mt-1" />
          <FieldError msg={errors.email} />
        </div>
        <div className="sm:col-span-2">
          <Label>Type of legal issue*</Label>
          <Select value={data.issueType} onValueChange={(v) => update("issueType", v)}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent className="bg-background">
              {["Copyright Infringement", "Royalty Dispute", "Contract Question", "Trademark", "DMCA Takedown", "Other"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <FieldError msg={errors.issueType} />
        </div>
      </div>
      <div>
        <Label htmlFor="l-desc">Describe the issue*</Label>
        <Textarea id="l-desc" value={data.description} onChange={(e) => update("description", e.target.value)} className="mt-1 min-h-[140px]" />
        <FieldError msg={errors.description} />
      </div>
      <div className="flex items-start gap-3">
        <Checkbox id="privacy-legal" checked={data.privacyAccepted} onCheckedChange={(v) => update("privacyAccepted", !!v)} />
        <Label htmlFor="privacy-legal" className="text-sm leading-relaxed cursor-pointer">
          I declare that I have read TrackSyra's Privacy Protection Policy*
        </Label>
      </div>
      <FieldError msg={errors.privacyAccepted} />
      <Button type="submit" variant="hero" size="xl" className="w-full" disabled={submitting}>
        {submitting ? "Sending..." : (<>Submit <Send className="w-5 h-5" /></>)}
      </Button>
    </form>
  );
};

/* ---------- MAIN SECTION ---------- */
const ContactSection = () => {
  const sectionRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(titleRef.current, { opacity: 0, y: 50 }, {
        opacity: 1, y: 0, duration: 1, ease: "power3.out",
        scrollTrigger: { trigger: titleRef.current, start: "top 85%" },
      });
      gsap.fromTo(cardRef.current, { opacity: 0, y: 40, scale: 0.98 }, {
        opacity: 1, y: 0, scale: 1, duration: 0.8, ease: "power2.out",
        scrollTrigger: { trigger: cardRef.current, start: "top 85%" },
      });
    }, sectionRef);
    return () => ctx.revert();
  }, []);

  return (
    <section ref={sectionRef} id="contact" className="py-16 bg-background">
      <div className="container mx-auto px-4">
        <div ref={titleRef} className="text-center mb-10" style={{ opacity: 0 }}>
          <h2 className="text-3xl sm:text-4xl font-bold mb-3 text-foreground">
            Get in <span className="gradient-text">Touch</span>
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Whether you're an artist, publisher, or have a legal concern — choose the right form below and we'll respond within 24 hours.
          </p>
        </div>

        <div ref={cardRef} className="max-w-3xl mx-auto p-6 sm:p-8 rounded-2xl bg-card border border-border shadow-lg" style={{ opacity: 0 }}>
          <Tabs defaultValue="artist" className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-8 h-auto">
              <TabsTrigger value="artist" className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 py-3 text-xs sm:text-sm">
                <Music2 className="w-4 h-4" />
                <span>Artists, Labels & Songwriters</span>
              </TabsTrigger>
              <TabsTrigger value="publisher" className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 py-3 text-xs sm:text-sm">
                <BookOpen className="w-4 h-4" />
                <span>Publishers</span>
              </TabsTrigger>
              <TabsTrigger value="legal" className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 py-3 text-xs sm:text-sm">
                <Scale className="w-4 h-4" />
                <span>Legal Issue</span>
              </TabsTrigger>
            </TabsList>
            <TabsContent value="artist"><ArtistForm /></TabsContent>
            <TabsContent value="publisher"><PublisherForm /></TabsContent>
            <TabsContent value="legal"><LegalForm /></TabsContent>
          </Tabs>
        </div>
      </div>
    </section>
  );
};

export default ContactSection;
