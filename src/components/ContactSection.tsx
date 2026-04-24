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
  email: z.string().trim().email("Invalid email").max(255),
  phone: z.string().trim().min(5, "Required").max(30),
  firstName: z.string().trim().min(1, "Required").max(100),
  lastName: z.string().trim().min(1, "Required").max(100),
  country: z.string().min(1, "Required"),
  city: z.string().trim().min(1, "Required").max(100),
  artistName: z.string().trim().min(1, "Required").max(150),
  role: z.enum(["Artist", "Label", "Songwriter & Publisher"]),
  genre: z.string().min(1, "Required"),
  workingWithPublisher: z.enum(["Yes", "No"]),
  catalogueSize: z.string().min(1, "Required"),
  privateLink: z.string().url("Invalid URL").min(1, "Required"),
  streamingPlatform: z.string().min(1, "Required"),
  monthlyListeners: z.string().min(1, "Required"),
  socials: z.string().optional(),
  privacyAccepted: z.literal(true, { errorMap: () => ({ message: "You must accept the privacy policy" }) }),
});

const legalSchema = z.object({
  media: z.enum(["Audio & other", "Video"]),
  firstName: z.string().trim().min(1, "Required").max(100),
  lastName: z.string().trim().min(1, "Required").max(100),
  legalRepresentative: z.string().optional(),
  companyName: z.string().optional(),
  country: z.string().min(1, "Required"),
  city: z.string().trim().min(1, "Required").max(100),
  email: z.string().trim().email("Invalid email").max(255),
  phone: z.string().trim().min(5, "Required").max(30),
  description: z.string().trim().min(20, "Min 20 characters").max(3000),
  territories: z.string().trim().min(1, "Required").max(500),
  goodFaith: z.literal(true, { errorMap: () => ({ message: "Required" }) }),
  accuracyStatement: z.literal(true, { errorMap: () => ({ message: "Required" }) }),
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
  const [data, setData] = useState({
    email: "", phone: "", firstName: "", lastName: "", country: "", city: "",
    artistName: "", role: "Artist", genre: "", workingWithPublisher: "No",
    catalogueSize: "", privateLink: "", streamingPlatform: "Spotify",
    monthlyListeners: "", socials: "", privacyAccepted: false,
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
    const r = publisherSchema.safeParse(data);
    if (!r.success) {
      const fe: Record<string, string> = {};
      r.error.errors.forEach((er) => { fe[er.path[0] as string] = er.message; });
      setErrors(fe);
      toast({ title: "Please fix errors", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const res = await submitToWeb3Forms({ form_type: "Publisher Inquiry", ...data });
      if (res.success) {
        toast({ title: "Submitted!", description: "We'll be in touch soon." });
        setData((p) => ({ ...p, email: "", phone: "", firstName: "", lastName: "", city: "", artistName: "", privateLink: "", socials: "", privacyAccepted: false }));
      } else throw new Error();
    } catch {
      toast({ title: "Error", variant: "destructive" });
    } finally { setSubmitting(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      <p className="text-sm text-muted-foreground bg-muted/40 p-4 rounded-lg border border-border">
        This form is for those who would like to collaborate with TrackSyra Music Publishing. If you are interested in learning more about our publishing solutions, please fill out the form below.
      </p>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="p-email">Email*</Label>
          <Input id="p-email" type="email" value={data.email} onChange={(e) => update("email", e.target.value)} className="mt-1" />
          <FieldError msg={errors.email} />
        </div>
        <div>
          <Label htmlFor="p-phone">Phone Number*</Label>
          <Input id="p-phone" type="tel" placeholder="🇮🇳 +91" value={data.phone} onChange={(e) => update("phone", e.target.value)} className="mt-1" />
          <FieldError msg={errors.phone} />
        </div>
        <div>
          <Label htmlFor="p-fn">First Name*</Label>
          <Input id="p-fn" value={data.firstName} onChange={(e) => update("firstName", e.target.value)} className="mt-1" />
          <FieldError msg={errors.firstName} />
        </div>
        <div>
          <Label htmlFor="p-ln">Last Name*</Label>
          <Input id="p-ln" value={data.lastName} onChange={(e) => update("lastName", e.target.value)} className="mt-1" />
          <FieldError msg={errors.lastName} />
        </div>
        <div>
          <Label>Country/Region*</Label>
          <Select value={data.country} onValueChange={(v) => update("country", v)}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent className="max-h-72 bg-background">
              {COUNTRIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <FieldError msg={errors.country} />
        </div>
        <div>
          <Label htmlFor="p-city">City*</Label>
          <Input id="p-city" value={data.city} onChange={(e) => update("city", e.target.value)} className="mt-1" />
          <FieldError msg={errors.city} />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="p-artist">Your Name (Artist, Band, Label)*</Label>
          <Input id="p-artist" value={data.artistName} onChange={(e) => update("artistName", e.target.value)} className="mt-1" />
          <FieldError msg={errors.artistName} />
        </div>
        <div className="sm:col-span-2">
          <Label className="mb-2 block">You are*</Label>
          <RadioGroup value={data.role} onValueChange={(v) => update("role", v)} className="flex flex-wrap gap-4">
            {["Artist", "Label", "Songwriter & Publisher"].map((r) => (
              <div key={r} className="flex items-center gap-2">
                <RadioGroupItem value={r} id={`p-role-${r}`} />
                <Label htmlFor={`p-role-${r}`} className="cursor-pointer">{r}</Label>
              </div>
            ))}
          </RadioGroup>
        </div>
        <div>
          <Label>Main Music Genre*</Label>
          <Select value={data.genre} onValueChange={(v) => update("genre", v)}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent className="max-h-72 bg-background">
              {GENRES.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
            </SelectContent>
          </Select>
          <FieldError msg={errors.genre} />
        </div>
        <div>
          <Label>Currently working with a publisher?*</Label>
          <Select value={data.workingWithPublisher} onValueChange={(v) => update("workingWithPublisher", v)}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-background">
              <SelectItem value="Yes">Yes</SelectItem>
              <SelectItem value="No">No</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Size of Catalogue*</Label>
          <Select value={data.catalogueSize} onValueChange={(v) => update("catalogueSize", v)}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent className="bg-background">
              {["1 – 10 songs", "11 – 50 songs", "51 – 200 songs", "201 – 500 songs", "> 500 songs"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <FieldError msg={errors.catalogueSize} />
        </div>
        <div>
          <Label htmlFor="p-link">Private link for your next release/project*</Label>
          <Input id="p-link" type="url" placeholder="https://..." value={data.privateLink} onChange={(e) => update("privateLink", e.target.value)} className="mt-1" />
          <FieldError msg={errors.privateLink} />
        </div>
        <div>
          <Label>Streaming Platform</Label>
          <Select value={data.streamingPlatform} onValueChange={(v) => update("streamingPlatform", v)}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-background">
              {["Spotify", "Apple Music", "YouTube Music", "JioSaavn", "Gaana", "Other"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="sm:col-span-2">
          <Label>Total Monthly Listeners on Key Streaming Platforms*</Label>
          <Select value={data.monthlyListeners} onValueChange={(v) => update("monthlyListeners", v)}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent className="bg-background">
              {["0 – 1K", "1K – 10K", "10K – 100K", "100K – 1M", "> 1M"].map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-1">
            Please indicate your actual monthly listeners. Any demand with erroneous information will be discarded.
          </p>
          <FieldError msg={errors.monthlyListeners} />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="p-socials">Your Social Media Presence (Instagram, Facebook, TikTok, YouTube, VK)</Label>
          <Textarea id="p-socials" placeholder="Instagram: @handle, YouTube: channel link, etc." value={data.socials} onChange={(e) => update("socials", e.target.value)} className="mt-1 min-h-[80px]" />
        </div>
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
  const [data, setData] = useState({
    media: "Audio & other",
    firstName: "", lastName: "", legalRepresentative: "", companyName: "",
    country: "", city: "", email: "", phone: "",
    description: "", territories: "",
    goodFaith: false, accuracyStatement: false, privacyAccepted: false,
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
    const r = legalSchema.safeParse(data);
    if (!r.success) {
      const fe: Record<string, string> = {};
      r.error.errors.forEach((er) => { fe[er.path[0] as string] = er.message; });
      setErrors(fe);
      toast({ title: "Please fix errors", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const res = await submitToWeb3Forms({ form_type: "Legal Issue / Copyright Claim", ...data });
      if (res.success) {
        toast({ title: "Submitted!", description: "Our legal team will review and respond." });
        setData((p) => ({ ...p, firstName: "", lastName: "", legalRepresentative: "", companyName: "", city: "", email: "", phone: "", description: "", territories: "", goodFaith: false, accuracyStatement: false, privacyAccepted: false }));
      } else throw new Error();
    } catch {
      toast({ title: "Error", variant: "destructive" });
    } finally { setSubmitting(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-8">
      {/* Step 01 */}
      <div>
        <StepBadge n="01" label="Your Information" />
        <div className="space-y-5">
          <div>
            <Label className="mb-2 block">Media*</Label>
            <RadioGroup value={data.media} onValueChange={(v) => update("media", v)} className="flex flex-wrap gap-4">
              {["Audio & other", "Video"].map((m) => (
                <div key={m} className="flex items-center gap-2">
                  <RadioGroupItem value={m} id={`media-${m}`} />
                  <Label htmlFor={`media-${m}`} className="cursor-pointer">{m}</Label>
                </div>
              ))}
            </RadioGroup>
          </div>

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
            <div>
              <Label htmlFor="l-rep">Legal representative</Label>
              <Input id="l-rep" value={data.legalRepresentative} onChange={(e) => update("legalRepresentative", e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="l-comp">Company name</Label>
              <Input id="l-comp" value={data.companyName} onChange={(e) => update("companyName", e.target.value)} className="mt-1" />
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
              <Label htmlFor="l-city">City*</Label>
              <Input id="l-city" value={data.city} onChange={(e) => update("city", e.target.value)} className="mt-1" />
              <FieldError msg={errors.city} />
            </div>
            <div>
              <Label htmlFor="l-em">Email*</Label>
              <Input id="l-em" type="email" value={data.email} onChange={(e) => update("email", e.target.value)} className="mt-1" />
              <FieldError msg={errors.email} />
            </div>
            <div>
              <Label htmlFor="l-ph">Phone*</Label>
              <Input id="l-ph" type="tel" value={data.phone} onChange={(e) => update("phone", e.target.value)} className="mt-1" />
              <FieldError msg={errors.phone} />
            </div>
          </div>
        </div>
      </div>

      {/* Step 02 */}
      <div>
        <StepBadge n="02" label="Copyright & Legal Issue" />
        <div className="space-y-5">
          <div>
            <Label htmlFor="l-desc">Description of the copyright and legal issue*</Label>
            <Textarea id="l-desc" value={data.description} onChange={(e) => update("description", e.target.value)} className="mt-1 min-h-[140px]" />
            <FieldError msg={errors.description} />
          </div>
          <div>
            <Label htmlFor="l-terr">Territories where copyright problems exist*</Label>
            <Textarea id="l-terr" placeholder="e.g. India, United States, Worldwide..." value={data.territories} onChange={(e) => update("territories", e.target.value)} className="mt-1 min-h-[80px]" />
            <FieldError msg={errors.territories} />
          </div>

          <div className="space-y-4 bg-muted/40 p-4 rounded-lg border border-border">
            <div className="flex items-start gap-3">
              <Checkbox id="goodFaith" checked={data.goodFaith} onCheckedChange={(v) => update("goodFaith", !!v)} className="mt-0.5" />
              <Label htmlFor="goodFaith" className="text-sm leading-relaxed cursor-pointer">
                I have a good faith belief that the use of the material complained of is not authorized by the copyright owner, its agent, or the law*
              </Label>
            </div>
            <FieldError msg={errors.goodFaith} />

            <div className="flex items-start gap-3">
              <Checkbox id="accuracy" checked={data.accuracyStatement} onCheckedChange={(v) => update("accuracyStatement", !!v)} className="mt-0.5" />
              <Label htmlFor="accuracy" className="text-sm leading-relaxed cursor-pointer">
                I state that the information in the claim is accurate, and under penalty of perjury, that the complaining party is the copyright owner or authorized to act on behalf of the owner of an exclusive right under copyright that is allegedly infringed*
              </Label>
            </div>
            <FieldError msg={errors.accuracyStatement} />
          </div>
        </div>
      </div>

      <div className="flex items-start gap-3">
        <Checkbox id="privacy-legal" checked={data.privacyAccepted} onCheckedChange={(v) => update("privacyAccepted", !!v)} />
        <Label htmlFor="privacy-legal" className="text-sm leading-relaxed cursor-pointer">
          I acknowledge that I have read TrackSyra's Privacy Policy*
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
