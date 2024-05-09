"use server"
import { revalidatePath } from "next/cache";
import Post from "../models/post.model";
import User from "../models/user.model";
import { connectToDB } from "../mongoose";
import Community from "../models/community.model";


export async function fetchPosts(pageNumber = 1, pageSize = 20) {
    connectToDB();
  
    // Calculate the number of posts to skip based on the page number and page size.
    const skipAmount = (pageNumber - 1) * pageSize;
  
    // Create a query to fetch the posts that have no parent (top-level threads) (a thread that is not a comment/reply).
    const postsQuery = Post.find({ parentId: { $in: [null, undefined] } })
      .sort({ createdAt: "desc" })
      .skip(skipAmount)
      .limit(pageSize)
      .populate({
        path: "author",
        model: User,
      })
      .populate({
        path: "community",
        model: Community,
      })
      .populate({
        path: "children", // Populate the children field
        populate: {
          path: "author", // Populate the author field within children
          model: User,
          select: "_id name parentId image", // Select only _id and username fields of the author
        },
      });
  
    // Count the total number of top-level posts (threads) i.e., threads that are not comments.
    const totalPostsCount = await Post.countDocuments({
      parentId: { $in: [null, undefined] },
    }); // Get the total count of posts
  
    const posts = await postsQuery.exec();
  
    const isNext = totalPostsCount > skipAmount + posts.length;
  
    return { posts, isNext };
  }
  
  interface Params {
    text: string,
    author: string,
    communityId: string | null,
    path: string,
  }
  
  export async function createPost({ text, author, communityId, path }: Params
  ) {
    try {
      connectToDB();
  
      const communityIdObject = await Community.findOne(
        { id: communityId },
        { _id: 1 }
      );
  
      const createdPost = await Post.create({
        text,
        author,
        community: communityIdObject, // Assign communityId if provided, or leave it null for personal account
      });
  
      // Update User model
      await User.findByIdAndUpdate(author, {
        $push: { posts: createdPost._id },
      });
  
      if (communityIdObject) {
        // Update Community model
        await Community.findByIdAndUpdate(communityIdObject, {
          $push: { posts: createdPost._id },
        });
      }
  
      revalidatePath(path);
    } catch (error: any) {
      throw new Error(`Failed to create post: ${error.message}`);
    }
  }
  
  async function fetchAllChildPosts(postId: string): Promise<any[]> {
    const childPosts = await Post.find({ parentId: postId });
  
    const descendantPosts = [];
    for (const childPost of childPosts) {
      const descendants = await fetchAllChildPosts(childPost._id);
      descendantPosts.push(childPost, ...descendants);
    }
  
    return descendantPosts;
  }
  
  export async function deletePost(id: string, path: string): Promise<void> {
    try {
      connectToDB();
  
      // Find the thread to be deleted (the main thread)
      const mainPost = await Post.findById(id).populate("author community");
  
      if (!mainPost) {
        throw new Error("Thread not found");
      }
  
      // Fetch all child threads and their descendants recursively
      const descendantPosts = await fetchAllChildPosts(id);
  
      // Get all descendant thread IDs including the main thread ID and child thread IDs
      const descendantPostIds = [
        id,
        ...descendantPosts.map((post) => post._id),
      ];
  
      // Extract the authorIds and communityIds to update User and Community models respectively
      const uniqueAuthorIds = new Set(
        [
          ...descendantPosts.map((post) => post.author?._id?.toString()), // Use optional chaining to handle possible undefined values
          mainPost.author?._id?.toString(),
        ].filter((id) => id !== undefined)
      );
  
      const uniqueCommunityIds = new Set(
        [
          ...descendantPosts.map((post) => post.community?._id?.toString()), // Use optional chaining to handle possible undefined values
          mainPost.community?._id?.toString(),
        ].filter((id) => id !== undefined)
      );
  
      // Recursively delete child threads and their descendants
      await Post.deleteMany({ _id: { $in: descendantPostIds } });
  
      // Update User model
      await User.updateMany(
        { _id: { $in: Array.from(uniqueAuthorIds) } },
        { $pull: { posts: { $in: descendantPostIds } } }
      );
  
      // Update Community model
      await Community.updateMany(
        { _id: { $in: Array.from(uniqueCommunityIds) } },
        { $pull: { posts: { $in: descendantPostIds } } }
      );
  
      revalidatePath(path);
    } catch (error: any) {
      throw new Error(`Failed to delete post: ${error.message}`);
    }
  }
  
  export async function fetchPostById(postId: string) {
    connectToDB();
  
    try {
      const post = await Post.findById(postId)
        .populate({
          path: "author",
          model: User,
          select: "_id id name image",
        }) // Populate the author field with _id and username
        .populate({
          path: "community",
          model: Community,
          select: "_id id name image",
        }) // Populate the community field with _id and name
        .populate({
          path: "children", // Populate the children field
          populate: [
            {
              path: "author", // Populate the author field within children
              model: User,
              select: "_id id name parentId image", // Select only _id and username fields of the author
            },
            {
              path: "children", // Populate the children field within children
              model: Post, // The model of the nested children (assuming it's the same "Thread" model)
              populate: {
                path: "author", // Populate the author field within nested children
                model: User,
                select: "_id id name parentId image", // Select only _id and username fields of the author
              },
            },
          ],
        })
        .exec();
  
      return post;
    } catch (err) {
      console.error("Error while fetching post:", err);
      throw new Error("Unable to fetch post");
    }
  }
  
  export async function addCommentToPost(
    postId: string,
    commentText: string,
    userId: string,
    path: string
  ) {
    connectToDB();
  
    try {
      // Find the original thread by its ID
      const originalPost = await Post.findById(postId);
  
      if (!originalPost) {
        throw new Error("Post not found");
      }
  
      // Create the new comment thread
      const commentPost = new Post({
        text: commentText,
        author: userId,
        parentId: postId, // Set the parentId to the original thread's ID
      });
  
      // Save the comment thread to the database
      const savedCommentPost = await commentPost.save();
  
      // Add the comment thread's ID to the original thread's children array
      originalPost.children.push(savedCommentPost._id);
  
      // Save the updated original thread to the database
      await originalPost.save();
  
      revalidatePath(path);
    } catch (err) {
      console.error("Error while adding comment:", err);
      throw new Error("Unable to add comment");
    }
  }

// interface Params {
//     text: string,
//     author: string,
//     communityId: string | null,
//     path: string,
// }

// export async function createPost({ text, author, communityId, path }: Params) {
//     try {
//         connectToDB();
//         const communityIdObject = await Community.findOne(
//             {id: communityId},
//             { _id: 1}
//         )
//         const createdPost = await Post.create({
//             text,
//             author,
//             community: communityIdObject,
//         })
//         //update user moedl
//         await User.findByIdAndUpdate(author, {
//             $push: { posts: createdPost._id }
//         })

//         if(communityIdObject){
//             await Community.findByIdAndUpdate(communityIdObject,{
//                 $push: {post: createdPost._id}
//             })
//         }

//         revalidatePath(path);
//     } catch (error: any) {
//         throw new Error(`Error creating post ${error.message}`)
//     }

// };

// export async function fetchPosts(pageNumber = 1, pageSize = 20) {
//     connectToDB();

//     //calculate hte nuber of pages to skip
//     const skipAmount = (pageNumber - 1) * pageSize;

//     //fetch posts htat have no parents(top-level)
//     const postsQuery = Post.find({ parentId: { $in: [null, undefined] } })
//         .sort({ createdAt: 'desc' })
//         .skip(skipAmount)
//         .limit(pageSize)
//         .populate({ path: 'author', model: User })
//         .populate({
//             path: 'children',
//             populate: {
//                 path: 'author',
//                 model: User,
//                 select: "_id name parentId image"
//             }
//         })

//     const totalPostCount = await Post.countDocuments({ parentId: { $in: [null, undefined] } })
//     const posts = await postsQuery.exec();
//     const isNext = totalPostCount > skipAmount + posts.length;
//     return { posts, isNext }
// }

// export async function fetchPostById(id: string) {
//     connectToDB();
//     try {
//         //todo populate coomunnity
//         const post = await Post.findById(id)
//             .populate({
//                 path: 'author',
//                 model: User,
//                 select: "_id id name image"
//             })
//             .populate({
//                 path: 'children',
//                 populate: [
//                     {
//                         path: 'author',
//                         model: User,
//                         select: "_id id name parentId image"
//                     },
//                     {
//                         path: 'children',
//                         model: Post,
//                         populate: {
//                             path: 'author',
//                             model: User,
//                             select: "_id id name parentId image"
//                         }
//                     }
//                 ]
//             }).exec();
//         return post;
//     } catch (error: any) {
//         throw new Error(`Error fetching post: ${error.message}`)
//     }
// }

// export async function addCommentToPost(
//     postId: string,
//     commentText: string,
//     userId: string,
//     path: string) {
//         connectToDB();
//         try {
//             const originalPost = await Post.findById(postId);
//             if(!originalPost){
//                 throw new Error("Post not found")
//             }
//             //create new post with comment
//             const commentPost = new Post({
//                 text: commentText,
//                 author: userId,
//                 parentId: postId,
//             })
//             //save the new post
//             const savedCommentPost = await commentPost.save()

//             //update original post to add commnt
//             originalPost.children.push(savedCommentPost._id)

//             //save original post
//             await originalPost.save()

//             revalidatePath(path);
//         } catch (error: any) {
//             throw new Error(`Error adding comment to post: ${error.message}`)
//         }
// }


