"use server"
import { revalidatePath } from "next/cache";
import Post from "../models/post.model";
import User from "../models/user.model";
import { connectToDB } from "../mongoose";


interface Params {
    text: string,
    author: string,
    communityId: string | null,
    path: string,
}

export async function createPost({ text, author, communityId, path }: Params) {
    try {
        connectToDB();
        const createdPost = await Post.create({
            text,
            author,
            community: null,
        })
        //update user moedl
        await User.findByIdAndUpdate(author, {
            $push: { posts: createdPost._id }
        })

        revalidatePath(path);
    } catch (error: any) {
        throw new Error(`Error creating post ${error.message}`)
    }

};

export async function fetchPosts(pageNumber = 1, pageSize = 20) {
    connectToDB();

    //calculate hte nuber of pages to skip
    const skipAmount = (pageNumber - 1) * pageSize;

    //fetch posts htat have no parents(top-level)
    const postsQuery = Post.find({ parentId: { $in: [null, undefined] } })
        .sort({ createdAt: 'desc' })
        .skip(skipAmount)
        .limit(pageSize)
        .populate({ path: 'author', model: User })
        .populate({
            path: 'children',
            populate: {
                path: 'author',
                model: User,
                select: "_id name parentId image"
            }
        })

    const totalPostCount = await Post.countDocuments({ parentId: { $in: [null, undefined] } })
    const posts = await postsQuery.exec();
    const isNext = totalPostCount > skipAmount + posts.length;
    return { posts, isNext }
}

export async function fetchPostById(id: string) {
    connectToDB();
    try {
        //todo populate coomunnity
        const post = await Post.findById(id)
            .populate({
                path: 'author',
                model: User,
                select: "_id id name image"
            })
            .populate({
                path: 'children',
                populate: [
                    {
                        path: 'author',
                        model: User,
                        select: "_id id name parentId image"
                    },
                    {
                        path: 'children',
                        model: Post,
                        populate: {
                            path: 'author',
                            model: User,
                            select: "_id id name parentId image"
                        }
                    }
                ]
            }).exec();
        return post;
    } catch (error: any) {
        throw new Error(`Error fetching post: ${error.message}`)
    }
}

export async function addCommentToPost(
    postId: string,
    commentText: string,
    userId: string,
    path: string) {
        connectToDB();
        try {
            const originalPost = await Post.findById(postId);
            if(!originalPost){
                throw new Error("Post not found")
            }
            //create new post with comment
            const commentPost = new Post({
                text: commentText,
                author: userId,
                parentId: postId,
            })
            //save the new post
            const savedCommentPost = await commentPost.save()

            //update original post to add commnt
            originalPost.children.push(savedCommentPost._id)

            //save original post
            await originalPost.save()

            revalidatePath(path);
        } catch (error: any) {
            throw new Error(`Error adding comment to post: ${error.message}`)
        }
}