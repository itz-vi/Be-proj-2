const express = require('express');
const router = express.Router();
const userModel = require("./users");
const postModel = require("./posts");
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const upload = require('./multer');


const path = require("path");
const uploadsPath = path.join(__dirname, "uploads");
router.use("/uploads", express.static(uploadsPath));

router.get('/', (req, res) => {
  res.render('index');
});

router.get("/login", function (req, res) {
  res.render("login");
});

router.get("/profile", isLoggedIn, async function (req, res) {
  const user = await userModel.findOne({ email: req.user.email }).populate("posts");
  res.render("profile", { user });
});

router.get("/like/:id", isLoggedIn, async function (req, res) {
  const post = await postModel.findById(req.params.id).populate('user');
  if (!post) {
    return res.status(404).send("Post not found");
  }

  if (post.likes.indexOf(req.user.userid) === -1) {
    post.likes.push(req.user.userid);
  } else {
    post.likes.splice(post.likes.indexOf(req.user.userid), 1);
  }

  await post.save();
  res.redirect("/profile");
});

router.get("/edit/:id", isLoggedIn, async function (req, res) {
  const post = await postModel.findById(req.params.id).populate('user');
  if (!post) {
    return res.status(404).send("Post not found");
  }

  // Check if the logged-in user is the owner of the post
  if (post.user._id.toString() !== req.user.userid) {
    return res.status(403).send("Unauthorized");
  }

  res.render("edit", { post });
});

// Update post route
router.post("/update/:id", isLoggedIn, async function (req, res) {
  const post = await postModel.findById(req.params.id);
  if (!post) {
    return res.status(404).send("Post not found");
  }

  // Check if the logged-in user is the owner of the post
  if (post.user.toString() !== req.user.userid) {
    return res.status(403).send("Unauthorized");
  }

  post.content = req.body.content;
  await post.save();
  res.redirect("/profile");
});



router.post("/post", upload.single('image'), isLoggedIn, async (req, res) => {
  try {
    const user = await userModel.findOne({ email: req.user.email });
    if (!user) {
      return res.status(404).send("User not found");
    }

    const { content } = req.body;
    const image = req.file ? req.file.filename : null;

    const post = await postModel.create({
      user: user._id,
      content,
      image
    });

    user.posts.push(post._id);
    await user.save();

    res.redirect("/profile");
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
});

router.post('/register', async (req, res) => {
  const { username, email, password, age } = req.body;

  const user = await userModel.findOne({ email });
  if (user) return res.status(500).redirect("/profile");

  bcrypt.genSalt(10, (err, salt) => {
    bcrypt.hash(password, salt, async (err, hash) => {
      const createdUser = await userModel.create({
        username,
        email,
        password: hash,
        age
      });
      const token = jwt.sign({ email: email, userid: createdUser._id }, "shhhh");
      res.cookie("token", token);
      res.redirect("/profile");
    });
  });
});

router.post("/login", async function (req, res) {
  const { email, password } = req.body;

  const user = await userModel.findOne({ email });
  if (!user) return res.status(500).send("Something went wrong");

  bcrypt.compare(password, user.password, function (err, result) {
    if (result) {
      const token = jwt.sign({ email: email, userid: user._id }, "shhhh");
      res.cookie("token", token);
      res.status(200).redirect("/profile");
    } else res.redirect("/login");
  });
});

router.get("/logout", function (req, res) {
  res.cookie("token", "");
  res.redirect("/login");
});

function isLoggedIn(req, res, next) {
  if (!req.cookies.token) {
    res.redirect("/login");
  } else {
    try {
      const data = jwt.verify(req.cookies.token, "shhhh");
      req.user = data;
      next();
    } catch (err) {
      res.redirect("/login");
    }
  }
}


// Delete post route
router.get("/delete/:id", isLoggedIn, async function (req, res) {
  const post = await postModel.findById(req.params.id);
  if (!post) {
    return res.status(404).send("Post not found");
  }

  // Check if the logged-in user is the owner of the post
  if (post.user.toString() !== req.user.userid) {
    return res.status(403).send("Unauthorized");
  }

  await postModel.deleteOne({ _id: req.params.id });

  // Remove the post reference from the user's posts array
  await userModel.updateOne(
    { _id: req.user.userid },
    { $pull: { posts: req.params.id } }
  );

  res.redirect("/profile");
});


module.exports = router;
