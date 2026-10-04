import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  FaBalanceScale,
  FaBriefcase,
  FaBuilding,
  FaChartBar,
  FaFlask,
  FaGraduationCap,
  FaHeartbeat,
  FaLaptopCode,
  FaLeaf,
  FaUsers,
} from "react-icons/fa";
import image1 from "../../assets/image.png";
import image2 from "../../assets/images.jpg";
import image3 from "../../assets/image1.jpg";
import image4 from "../../assets/image2.jpg";
import api from "../../services/api";
import "./Home.css";

const normalizeDepartmentPayload = (response) => {
  if (!response) return [];
  if (Array.isArray(response)) return response;
  if (Array.isArray(response.data)) return response.data;
  if (Array.isArray(response.departments)) return response.departments;
  if (Array.isArray(response.data?.departments)) return response.data.departments;
  if (Array.isArray(response.data?.data)) return response.data.data;
  if (Array.isArray(response.items)) return response.items;
  return [];
};

const getCollegeIcon = (collegeName = "") => {
  const normalizedName = String(collegeName).toLowerCase();
  if (normalizedName.includes("law")) return <FaBalanceScale />;
  if (normalizedName.includes("health") || normalizedName.includes("medical")) return <FaHeartbeat />;
  if (normalizedName.includes("science") || normalizedName.includes("technology") || normalizedName.includes("engineering")) return <FaFlask />;
  if (normalizedName.includes("agric") || normalizedName.includes("environment")) return <FaLeaf />;
  if (normalizedName.includes("business") || normalizedName.includes("econom")) return <FaChartBar />;
  if (normalizedName.includes("social") || normalizedName.includes("human")) return <FaBuilding />;
  if (normalizedName.includes("it") || normalizedName.includes("computer") || normalizedName.includes("informatics")) return <FaLaptopCode />;
  return <FaBuilding />;
};

const buildCollegeGroups = (departments = []) => {
  const grouped = new Map();

  departments.forEach((department) => {
    const collegeName = String(
      department?.college_name ?? department?.college ?? department?.collegeName ?? department?.faculty ?? "Unassigned"
    ).trim() || "Unassigned";

    const stream = String(
      department?.stream ?? department?.department_stream ?? department?.program_stream ?? ""
    ).trim() || "Not specified";

    const departmentName = String(
      department?.name ?? department?.department_name ?? department?.department ?? department?.dept_name ?? department?.program_name ?? ""
    ).trim();

    if (!grouped.has(collegeName)) {
      grouped.set(collegeName, {
        id: collegeName.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        name: collegeName,
        stream,
        icon: getCollegeIcon(collegeName),
        departments: [],
      });
    }

    const college = grouped.get(collegeName);
    if (departmentName && !college.departments.includes(departmentName)) {
      college.departments.push(departmentName);
    }
    if (!college.stream || college.stream === "Not specified") {
      college.stream = stream;
    }
  });

  return Array.from(grouped.values())
    .map((college) => ({
      ...college,
      count: college.departments.length,
      summary: `${college.stream} programs`,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
};

function Home() {
  const slides = [
    {
      image: image1,
      badge: "2016 E.C. / 2026 G.C. Placement Cycle",
      title: "Debre Tabor University Student Department Placement System",
      text: "A modern and trusted platform for departments, students, and placement offices to manage academic placement services with confidence.",
    },
    { image: image2 },
    { image: image3 },
    { image: image4 },
  ];

  // 1. በAdmin የሚለወጡ የይዘት መረጃዎች (ከነባሪ Default እሴቶች ጋር)
  const [homeSettings, setHomeSettings] = useState({
    academicYear: slides[0].badge,
    heroBadge: slides[0].badge,
    heroTitle: slides[0].title,
    heroText: slides[0].text,
    heroPrimaryButton: "View Placement Services",
    heroSecondaryButton: "Contact Office",
    directoryEyebrow: "Academic Excellence",
    directoryTitle: "DEBRE TABOR UNIVERSITY - COLLEGES & DEPARTMENTS",
    directorySubtitle: "Debre Tabor University is organized into diverse colleges and schools that serve students through strong academic programs, applied research, and practical professional training across science, technology, health, business, and the humanities.",
    statsHeading: "Why DTU students choose this portal",
    statsDescription: "This platform is designed to support departments in managing placement requests, tracking student progress, and connecting applicants with the right opportunities.",
    stat1Number: "120+",
    stat1Label: "Placement records",
    stat2Number: "24/7",
    stat2Label: "Support access",
    stat3Number: "95%",
    stat3Label: "Readiness rate",
    feature1Title: "Academic Placement",
    feature1Desc: "Support students across faculties with department-based placement coordination.",
    feature2Title: "Career Readiness",
    feature2Desc: "Prepare graduates for internships, employment, and professional growth.",
    feature3Title: "Student Support",
    feature3Desc: "Connect learners with advisors, employers, and university placement offices.",
    coreServicesTitle: "Core Services",
    coreService1: "Department placement tracking",
    coreService2: "Internship and job coordination",
    coreService3: "Student advisory support",
  });

  const highlights = [
    {
      icon: <FaGraduationCap />,
      title: homeSettings.feature1Title || "Academic Placement",
      description: homeSettings.feature1Desc || "Support students across faculties with department-based placement coordination.",
    },
    {
      icon: <FaBriefcase />,
      title: homeSettings.feature2Title || "Career Readiness",
      description: homeSettings.feature2Desc || "Prepare graduates for internships, employment, and professional growth.",
    },
    {
      icon: <FaUsers />,
      title: homeSettings.feature3Title || "Student Support",
      description: homeSettings.feature3Desc || "Connect learners with advisors, employers, and university placement offices.",
    },
  ];

  const [collegeGroups, setCollegeGroups] = useState([]);
  const [selectedCollege, setSelectedCollege] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [homepageStatistics, setHomepageStatistics] = useState(null);
  const [statisticsLoading, setStatisticsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      setLoading(true);
      setError("");

      try {
        const deptsRes = await api.get("api/common/departments_api.php");

        if (!isMounted) return;

        const normalizedDepartments = normalizeDepartmentPayload(deptsRes);
        const groupedColleges = buildCollegeGroups(normalizedDepartments);
        setCollegeGroups(groupedColleges);
        setSelectedCollege(groupedColleges[0] || null);
      } catch (fetchError) {
        if (!isMounted) return;
        setCollegeGroups([]);
        setSelectedCollege(null);
        setError("Unable to load colleges right now. Please try again later.");
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadData();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadHomepageStatistics = async () => {
      try {
        const response = await api.get("api/common/dashboard_overview_api.php");
        const statistics = response.data?.success ? response.data.data : null;
        const activeStudents = Number(statistics?.activeStudents);
        const departments = Number(statistics?.departments);

        if (isMounted && Number.isFinite(activeStudents) && Number.isFinite(departments)) {
          setHomepageStatistics({ activeStudents, departments });
        }
      } catch {
      } finally {
        if (isMounted) {
          setStatisticsLoading(false);
        }
      }
    };

    loadHomepageStatistics();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    const loadHomepageSettings = async () => {
      try {
        const response = await api.get("api/common/system_settings_api.php");
        if (!isMounted) return;

        const responseData = response.data;
        const savedSettings = responseData?.settings || responseData?.data?.settings || responseData?.data || responseData || {};
        let homepage = savedSettings.homepage || savedSettings.public_portal || savedSettings;
        if (typeof homepage === "string") {
          try {
            homepage = JSON.parse(homepage);
          } catch {
            homepage = {};
          }
        }
        if (!homepage || typeof homepage !== "object") return;

        setHomeSettings((current) => ({
          ...current,
          ...homepage,
          academicYear: homepage.academicYear || homepage.heroBadge || current.academicYear,
          heroBadge: homepage.heroBadge || homepage.academicYear || current.heroBadge,
          heroText: homepage.heroText || homepage.heroDescription || current.heroText,
        }));
      } catch {
      }
    };

    loadHomepageSettings();
    window.addEventListener("system-settings-updated", loadHomepageSettings);
    return () => {
      isMounted = false;
      window.removeEventListener("system-settings-updated", loadHomepageSettings);
    };
  }, []);

  const toggleCollege = (college) => {
    setSelectedCollege((currentSelected) =>
      currentSelected && currentSelected.name === college.name ? null : college
    );
  };

  return (
    <section className="home-page">
      <div className="container">
        {/* Hero Banner (በAdmin የሚቀየሩ ጽሁፎች) */}
        <div className="home-hero">
          {slides.map((slide, index) => (
            <div
              key={index}
              className="home-hero__slide"
              style={{ backgroundImage: `url(${slide.image})` }}
            />
          ))}

          <div className="home-hero__overlay">
            <div className="home-hero__content">
              <span className="home-hero__badge">{homeSettings.academicYear || homeSettings.heroBadge || slides[0].badge}</span>
              <h1 className="home-hero__title">{homeSettings.heroTitle || slides[0].title}</h1>
              <p className="home-hero__text">{homeSettings.heroText || slides[0].text}</p>
              <div className="home-hero__actions">
                <Link className="home-hero__button primary btn btn-lg" to="/services">
                  {homeSettings.heroPrimaryButton}
                </Link>
                <Link className="home-hero__button secondary btn btn-lg" to="/contact">
                  {homeSettings.heroSecondaryButton}
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Colleges & Departments Directory */}
        <div className="home-college-directory">
          <div className="home-college-directory__header">
            <span className="home-college-directory__eyebrow">{homeSettings.directoryEyebrow}</span>
            <h2 className="home-college-directory__title">{homeSettings.directoryTitle}</h2>
            <p className="home-college-directory__subtitle">
              {homeSettings.directorySubtitle}
            </p>
          </div>

          <div className="home-college-directory__content">
            <div className="home-college-directory__grid">
              {loading ? (
                <div className="home-college-directory__empty">Loading colleges...</div>
              ) : error ? (
                <div className="home-college-directory__empty">{error}</div>
              ) : collegeGroups.length === 0 ? (
                <div className="home-college-directory__empty">No colleges are currently available.</div>
              ) : (
                collegeGroups.map((college) => {
                  const isActive = selectedCollege?.name === college.name;

                  return (
                    <button
                      type="button"
                      key={college.id}
                      className={`home-college-card ${isActive ? "active" : ""}`}
                      onClick={() => toggleCollege(college)}
                    >
                      <div className="home-college-card__top">
                        <span className="home-college-card__icon">{college.icon}</span>
                        <span className="home-college-card__count">
                          {college.count} DEPARTMENT{college.count === 1 ? "" : "S"}
                        </span>
                      </div>

                      <h3>{college.name}</h3>
                      <p>{college.summary}</p>

                      <div className="home-college-card__preview">
                        {college.departments.slice(0, 4).map((department) => (
                          <span key={`${college.id}-${department}`}>{department}</span>
                        ))}
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {selectedCollege && !loading && !error && (
              <div className="home-college-directory__details">
                <div className="home-college-directory__details-header">
                  <span className="home-college-directory__details-icon">{selectedCollege.icon}</span>
                  <div>
                    <h3>{selectedCollege.name}</h3>
                    <p>
                      {selectedCollege.stream} • {selectedCollege.count} department{selectedCollege.count === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>

                <div className="home-college-directory__departments">
                  {selectedCollege.departments.map((department) => (
                    <span key={`${selectedCollege.id}-${department}`} className="home-college-directory__department-pill">
                      {department}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Portal Stats & Info (በAdmin የሚቀየሩ ቁጥሮች) */}
        <div className="row g-4 mt-2">
          <div className="col-lg-8">
            <div className="home-panel p-4">
              <h2 className="panel-title h4 fw-semibold mb-3">{homeSettings.statsHeading}</h2>
              <p className="text-muted mb-4">
                {homeSettings.statsDescription}
              </p>
              <div className="row g-3">
                <div className="col-sm-4">
                  <div className="home-stat">
                    <strong>{statisticsLoading ? "..." : homepageStatistics?.activeStudents ?? "—"}</strong>
                    <span className="text-muted">Total Students</span>
                  </div>
                </div>
                <div className="col-sm-4">
                  <div className="home-stat">
                    <strong>{statisticsLoading ? "..." : homepageStatistics?.departments ?? "—"}</strong>
                    <span className="text-muted">Total Departments</span>
                  </div>
                </div>
                <div className="col-sm-4">
                  <div className="home-stat">
                    <strong>{homeSettings.stat3Number}</strong>
                    <span className="text-muted">{homeSettings.stat3Label}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="col-lg-4">
            <div className="home-panel p-4">
              <h3 className="panel-title h5 fw-semibold mb-3">{homeSettings.coreServicesTitle}</h3>
              <ul className="list-unstyled mb-0">
                <li className="mb-2">• {homeSettings.coreService1}</li>
                <li className="mb-2">• {homeSettings.coreService2}</li>
                <li className="mb-2">• {homeSettings.coreService3}</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Feature Highlights */}
        <div className="row g-4 mt-1">
          {highlights.map((item) => (
            <div className="col-md-4" key={item.title}>
              <div className="home-panel p-4 h-100">
                <div className="mb-3" style={{ color: "#0f3d6e", fontSize: "1.3rem" }}>{item.icon}</div>
                <h3 className="panel-title h5 fw-semibold mb-2">{item.title}</h3>
                <p className="text-muted mb-0">{item.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default Home;